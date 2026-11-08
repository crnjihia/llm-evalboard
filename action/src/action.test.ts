import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GenerateRequest, GenerateResponse, Provider } from "@evalboard/providers";
import { describe, expect, it } from "vitest";
import {
  STICKY_COMMENT_MARKER,
  createLangfuseTracePayload,
  createOtelGenAiSpan,
  evaluateMergeGate,
  generateAsciiForestPlot,
  generatePrCommentMarkdown,
  runAction,
} from "./index.js";

describe("ASCII Forest Plot Generator", () => {
  it("renders forest plot with delta band and point estimate", () => {
    const plot = generateAsciiForestPlot(0.045, 0.02, 0.07, 0.03);
    expect(plot).toContain("Equivalence Band (±δ): [-0.030, +0.030]");
    expect(plot).toContain("Point Estimate (d):     +0.0450");
    expect(plot).toContain("Scale:");
    expect(plot).toContain("delta:");
    expect(plot).toContain("CI:");
    expect(plot).toContain("•");
    expect(plot).toContain("=");
  });

  it("handles negative differences and regressions correctly", () => {
    const plot = generateAsciiForestPlot(-0.06, -0.09, -0.03, 0.03);
    expect(plot).toContain("Point Estimate (d):     -0.0600");
    expect(plot).toContain("CI:");
    expect(plot).toContain("•");
  });
});

describe("Merge Gatekeeper Logic", () => {
  const defaultPolicy = {
    failOnRegression: true,
    failOnInconclusive: false,
    delta: 0.03,
  };

  it("approves merge when verdict is BETTER", () => {
    const result = evaluateMergeGate("BETTER", defaultPolicy);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toContain("statistically verified improvement");
  });

  it("approves merge when verdict is NO MEANINGFUL DIFFERENCE", () => {
    const result = evaluateMergeGate("NO MEANINGFUL DIFFERENCE", defaultPolicy);
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.reason).toContain("statistically equivalent");
  });

  it("blocks merge when verdict is WORSE and failOnRegression is true", () => {
    const result = evaluateMergeGate("WORSE", defaultPolicy);
    expect(result.passed).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(result.reason).toContain("performance regression");
  });

  it("allows merge on WORSE if failOnRegression is disabled", () => {
    const result = evaluateMergeGate("WORSE", { ...defaultPolicy, failOnRegression: false });
    expect(result.passed).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  it("handles INCONCLUSIVE according to failOnInconclusive flag", () => {
    const passResult = evaluateMergeGate("INCONCLUSIVE", defaultPolicy);
    expect(passResult.passed).toBe(true);
    expect(passResult.exitCode).toBe(0);

    const failResult = evaluateMergeGate("INCONCLUSIVE", {
      ...defaultPolicy,
      failOnInconclusive: true,
    });
    expect(failResult.passed).toBe(false);
    expect(failResult.exitCode).toBe(1);
  });
});

describe("PR Markdown Comment Generator", () => {
  it("generates markdown with sticky marker, accessible badges, forest plot, and metrics table", () => {
    const markdown = generatePrCommentMarkdown({
      suiteName: "summarization-eval",
      candidateName: "openai:gpt-4o",
      baselineName: "anthropic:claude-3-5-sonnet",
      candidateScore: 0.88,
      baselineScore: 0.82,
      meanDifference: 0.06,
      ciLower: 0.02,
      ciUpper: 0.1,
      confidence: 0.95,
      delta: 0.03,
      verdict: "BETTER",
      reasoning: "Candidate reliably improves summarization accuracy.",
      candidateCostUsd: 0.005,
      baselineCostUsd: 0.004,
      candidateLatencyMs: 450,
      baselineLatencyMs: 600,
      nPairs: 20,
      slices: [
        {
          tag: "topic=legal",
          n: 10,
          candidateScore: 0.9,
          baselineScore: 0.8,
          meanDifference: 0.1,
          ciLower: 0.04,
          ciUpper: 0.16,
          verdict: "BETTER",
        },
      ],
      commitSha: "abcdef123456",
    });

    expect(markdown).toContain(STICKY_COMMENT_MARKER);
    expect(markdown).toContain("## 🧪 Evaluation Report: `summarization-eval`");
    expect(markdown).toContain("🟢 **`[+] BETTER`** — Statistically significant improvement");
    expect(markdown).toContain("Forest Plot");
    expect(markdown).toContain("Core Metrics Comparison");
    expect(markdown).toContain("Slice Analysis");
    expect(markdown).toContain("`topic=legal`");
    expect(markdown).toContain("`abcdef1`");
  });

  it("includes power analysis recommendation when verdict is INCONCLUSIVE", () => {
    const markdown = generatePrCommentMarkdown({
      suiteName: "inconclusive-eval",
      candidateName: "candidate",
      baselineName: "baseline",
      candidateScore: 0.75,
      baselineScore: 0.74,
      meanDifference: 0.01,
      ciLower: -0.04,
      ciUpper: 0.06,
      confidence: 0.95,
      delta: 0.03,
      verdict: "INCONCLUSIVE",
      reasoning: "Sample size insufficient to resolve effect.",
      nPairs: 15,
      estimatedAdditionalCases: 45,
    });

    expect(markdown).toContain("🟡 **`[?] INCONCLUSIVE`**");
    expect(markdown).toContain("Statistical Power Recommendation");
    expect(markdown).toContain("estimated **45 additional test cases** are required");
  });
});

describe("Observability Integrations (OTel & Langfuse)", () => {
  it("creates standard OpenTelemetry GenAI spans with semantic attributes", () => {
    const span = createOtelGenAiSpan({
      suiteName: "smoke-suite",
      caseId: "case-001",
      model: "gpt-4o",
      provider: "openai",
      latencyMs: 145,
      inputTokens: 25,
      outputTokens: 50,
      costUsd: 0.001,
      score: 1.0,
      pass: true,
    });

    expect(span.name).toBe("evalboard.evaluation.gpt-4o");
    expect(span.attributes["gen_ai.system"]).toBe("openai");
    expect(span.attributes["gen_ai.request.model"]).toBe("gpt-4o");
    expect(span.attributes["gen_ai.usage.prompt_tokens"]).toBe(25);
    expect(span.attributes["gen_ai.usage.completion_tokens"]).toBe(50);
    expect(span.attributes["gen_ai.usage.total_tokens"]).toBe(75);
    expect(span.attributes["evalboard.score"]).toBe(1.0);
    expect(span.attributes["evalboard.pass"]).toBe(true);
  });

  it("formats Langfuse trace, generation, and score payload", () => {
    const payload = createLangfuseTracePayload({
      suiteName: "customer-support",
      caseId: "case-abc-1234567890",
      model: "claude-3-5-sonnet",
      inputContent: { query: "How to reset password?" },
      outputContent: "Click 'Forgot password' on the login screen.",
      latencyMs: 320,
      inputTokens: 15,
      outputTokens: 20,
      score: 0.95,
      reason: "Accurate step-by-step instructions provided",
    });

    expect(payload.id).toContain("tr-case-abc-123456");
    expect(payload.name).toBe("evalboard-customer-support");
    expect(payload.generation?.model).toBe("claude-3-5-sonnet");
    expect(payload.generation?.latencyMs).toBe(320);
    expect(payload.scores).toHaveLength(1);
    expect(payload.scores?.[0]?.value).toBe(0.95);
  });
});

describe("GitHub Action Runner E2E", () => {
  it("executes suite, compares candidate against baseline, and enforces merge gating", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "evalboard-action-test-"));
    const configPath = path.join(tempDir, "evalboard.yaml");
    const datasetPath = path.join(tempDir, "dataset.jsonl");

    // Dataset with 3 cases
    const datasetContent = [
      JSON.stringify({ input: { query: "ping" }, expected: "pong", tags: ["smoke"] }),
      JSON.stringify({ input: { query: "apple" }, expected: "fruit", tags: ["entity"] }),
      JSON.stringify({ input: { query: "paris" }, expected: "france", tags: ["geo"] }),
    ].join("\n");
    await fs.writeFile(datasetPath, datasetContent, "utf-8");

    const suiteContent = `
name: "CI Action Smoke Suite"
prompts:
  - "Answer: {{query}}"
models:
  - provider: mock
    model: baseline-model
  - provider: mock
    model: candidate-model
dataset: "${datasetPath.replace(/\\/g, "/")}"
baseline:
  prompt: "Answer: {{query}}"
  model: baseline-model
delta: 0.03
graders:
  - type: exact
    config:
      trim: true
`;
    await fs.writeFile(configPath, suiteContent, "utf-8");

    // Mock candidate provider (returns correct answers)
    const mockCandidate: Provider = {
      name: "mock-candidate",
      async generate(req: GenerateRequest): Promise<GenerateResponse> {
        const query = req.messages[0]?.content ?? "";
        let text = "pong";
        if (query.includes("apple")) text = "fruit";
        if (query.includes("paris")) text = "france";

        return {
          text,
          usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: 0.0001 },
          latencyMs: 80,
          cached: false,
        };
      },
      getCapabilities() {
        return {
          supportsTemperature: true,
          supportsSeed: true,
          supportsSystemPrompt: true,
          supportsJsonMode: false,
          supportsToolUse: false,
        };
      },
      estimateCost() {
        return 0.0001;
      },
    };

    // Mock baseline provider (returns wrong answers)
    const mockBaseline: Provider = {
      name: "mock-baseline",
      async generate(): Promise<GenerateResponse> {
        return {
          text: "incorrect",
          usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: 0.0001 },
          latencyMs: 110,
          cached: false,
        };
      },
      getCapabilities() {
        return {
          supportsTemperature: true,
          supportsSeed: true,
          supportsSystemPrompt: true,
          supportsJsonMode: false,
          supportsToolUse: false,
        };
      },
      estimateCost() {
        return 0.0001;
      },
    };

    const outputs = await runAction({
      inputs: {
        config: configPath,
        failOnRegression: true,
        failOnInconclusive: false,
        delta: 0.03,
        repeats: 1,
      },
      customCandidateProvider: mockCandidate,
      customBaselineProvider: mockBaseline,
    });

    expect(outputs.verdict).toBe("BETTER");
    expect(outputs.effectSize).toBe(1.0); // 100% improvement
    expect(outputs.passed).toBe(true);
    expect(outputs.reportMarkdown).toContain("🟢 **`[+] BETTER`**");
    expect(outputs.reportMarkdown).toContain("CI Action Smoke Suite");

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
