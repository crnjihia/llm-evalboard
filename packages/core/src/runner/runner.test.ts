import { describe, expect, it } from "vitest";
import { type Suite, parseSuiteConfig } from "../suite.js";
import type { AbstractProvider } from "./executor.js";
import type { PromptVersionMap } from "./matrix.js";
import { runSuite } from "./orchestrator.js";
import { filterSymmetricPairs } from "./symmetric-exclusion.js";

// Mock provider factory for runner test suite
class TestProvider implements AbstractProvider {
  private callCount = 0;

  constructor(
    readonly name: string,
    private readonly failOnTaskId?: Set<string>,
    private readonly costPerCallUsd = 0.05,
    private readonly cache?: Map<string, string>,
  ) {}

  getCallCount(): number {
    return this.callCount;
  }

  async generate(req: {
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    params?: Record<string, unknown>;
  }) {
    const prompt = req.messages[0]?.content ?? "";
    const key = `${req.model}:${prompt}`;

    if (this.cache?.has(key)) {
      return {
        text: this.cache.get(key) ?? "",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          costUsd: 0,
          originalCostUsd: this.costPerCallUsd,
        },
        latencyMs: 1,
        cached: true,
      };
    }

    this.callCount++;

    if (this.failOnTaskId?.has(key) || this.failOnTaskId?.has(prompt)) {
      const err = new Error("Injected provider rate limit error");
      (err as { code?: string }).code = "rate_limit";
      throw err;
    }

    const text = `Output for: ${prompt}`;
    if (this.cache) {
      this.cache.set(key, text);
    }

    return {
      text,
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        costUsd: this.costPerCallUsd,
      },
      latencyMs: 10,
      cached: false,
    };
  }
}

describe("runner execution engine & reproducibility (Phase 4 Acceptance Criteria)", () => {
  const sampleSuite: Suite = parseSuiteConfig({
    name: "test-suite",
    prompts: ["p1"],
    models: ["mock:model-a", "mock:model-b"],
    dataset: "ds1",
    repeats: 1,
    graders: [{ type: "exact", config: { match: "test" } }],
    baseline: { prompt: "p1", model: "mock:model-a" },
  });

  const promptMap: PromptVersionMap = {
    p1: {
      name: "p1",
      version: {
        id: "hash-prompt-p1".padEnd(64, "0"),
        promptId: "00000000-0000-0000-0000-000000000001",
        template: "Solve query: {{q}}",
        createdAt: new Date(),
      },
    },
  };

  const cases = [
    { id: "case-1".padEnd(64, "0"), caseIndex: 0, input: { q: "case 1" } },
    { id: "case-2".padEnd(64, "0"), caseIndex: 1, input: { q: "case 2" } },
    { id: "case-3".padEnd(64, "0"), caseIndex: 2, input: { q: "case 3" } },
    { id: "case-4".padEnd(64, "0"), caseIndex: 3, input: { q: "case 4" } },
  ];

  it("kill-and-resume test completes with no duplicated work", async () => {
    const provider = new TestProvider("mock");

    // Phase 1: Simulate interrupted run where only the first 2 tasks completed before interruption
    const initialRun = await runSuite(sampleSuite, promptMap, cases, {
      concurrency: 2,
      providerResolver: () => provider,
    });

    // 2 models * 4 cases * 1 repeat = 8 total tasks
    expect(initialRun.matrix.totalTasks).toBe(8);
    expect(provider.getCallCount()).toBe(8);

    // Now simulate resuming: first 5 tasks were already persisted in DB
    const simulatedCompletedTasks = new Set(
      initialRun.matrix.tasks.slice(0, 5).map((t) => t.taskId),
    );

    const secondProvider = new TestProvider("mock");

    // Resume run with completedTaskIds passed
    const resumedRun = await runSuite(sampleSuite, promptMap, cases, {
      concurrency: 2,
      completedTaskIds: simulatedCompletedTasks,
      providerResolver: () => secondProvider,
    });

    // Exactly 3 remaining tasks should have been executed, and 5 tasks skipped!
    expect(resumedRun.execution.tasksSkippedDueToResumption).toBe(5);
    expect(resumedRun.execution.totalTasksExecuted).toBe(3);
    expect(secondProvider.getCallCount()).toBe(3); // NO duplicated work!
  });

  it("re-running an unchanged run makes zero provider calls when cached", async () => {
    const sharedCache = new Map<string, string>();
    const provider1 = new TestProvider("mock", undefined, 0.05, sharedCache);

    // Initial run
    const run1 = await runSuite(sampleSuite, promptMap, cases, {
      providerResolver: () => provider1,
    });

    expect(provider1.getCallCount()).toBe(8);
    expect(run1.execution.totalTasksExecuted).toBe(8);

    // Re-run unchanged run pointing to same cache
    const provider2 = new TestProvider("mock", undefined, 0.05, sharedCache);
    const rerun = await runSuite(sampleSuite, promptMap, cases, {
      providerResolver: () => provider2,
    });

    // ZERO provider calls made on re-run!
    expect(provider2.getCallCount()).toBe(0);
    expect(rerun.execution.results.every((r) => r.cached)).toBe(true);
    // Cost of cached calls is $0.00
    expect(rerun.execution.cumulativeCostUsd).toBe(0);
  });

  it("error handling test: injected provider errors are counted, shown, and excluded symmetrically", async () => {
    // Inject error on case 2 for model-b
    const failingPrompt = "model-b:Solve query: case 2";
    const failSet = new Set([failingPrompt]);
    const provider = new TestProvider("mock", failSet);

    const run = await runSuite(sampleSuite, promptMap, cases, {
      providerResolver: () => provider,
    });

    // Check that error was captured and not dropped
    const cellB = Object.values(run.execution.cellSummaries).find((c) =>
      c.cellId.includes("model-b"),
    );
    expect(cellB).toBeDefined();
    expect(cellB?.errorCount).toBe(1);
    expect(cellB?.errorRate).toBe(0.25); // 1 error out of 4 cases

    // Symmetric Exclusion Test:
    // Candidate arm had an error on case 2. Baseline arm succeeded on case 2.
    // Symmetrical exclusion MUST exclude case 2 from paired analysis!
    const baselineResults = [
      { caseId: "case-1", score: 1.0, error: null },
      { caseId: "case-2", score: 1.0, error: null }, // Succeeded in baseline
      { caseId: "case-3", score: 1.0, error: null },
    ];

    const candidateResults = [
      { caseId: "case-1", score: 0.9, error: null },
      { caseId: "case-2", score: 0.0, error: { code: "rate_limit", message: "Quota exceeded" } }, // Errored in candidate
      { caseId: "case-3", score: 0.9, error: null },
    ];

    const paired = filterSymmetricPairs(baselineResults, candidateResults);

    expect(paired.totalCaseIds).toBe(3);
    // Exactly 1 pair excluded symmetrically
    expect(paired.excludedCount).toBe(1);
    expect(paired.excludedPairs[0]?.caseId).toBe("case-2");
    expect(paired.excludedPairs[0]?.reason).toContain("candidate arm");

    // Valid pairs contain only cases 1 and 3
    expect(paired.validPairs).toHaveLength(2);
    expect(paired.validPairs.map((p) => p.caseId)).toEqual(["case-1", "case-3"]);
  });

  it("cost cap test stops the run within one batch of the cap", async () => {
    // Each call costs $0.05
    // With 8 tasks and concurrency 2, batch size is 2 tasks = $0.10 per batch.
    // If cap is $0.15, batch 1 spends $0.10 (ok), batch 2 spends $0.10 (cumulative = $0.20 >= cap),
    // and execution stops before batch 3!
    const provider = new TestProvider("mock", undefined, 0.05);

    const run = await runSuite(sampleSuite, promptMap, cases, {
      concurrency: 2,
      maxCostUsd: 0.15,
      providerResolver: () => provider,
    });

    expect(run.execution.costCapExceeded).toBe(true);
    expect(run.execution.totalTasksExecuted).toBeLessThan(8);
    expect(run.execution.totalTasksExecuted).toBe(4); // stopped after 2 batches (4 tasks)!
    expect(run.execution.cumulativeCostUsd).toBe(0.2);
    expect(run.execution.error).toContain("Cost cap");
  });

  it("dry run computes estimate and exits without calling provider", async () => {
    const provider = new TestProvider("mock");

    const run = await runSuite(sampleSuite, promptMap, cases, {
      dryRun: true,
      providerResolver: () => provider,
    });

    expect(run.execution.isDryRun).toBe(true);
    expect(run.execution.totalTasksExecuted).toBe(0);
    expect(provider.getCallCount()).toBe(0); // Zero provider calls!
    expect(run.costEstimate.totalEstimatedTasks).toBe(8);
  });
});
