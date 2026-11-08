import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GenerateRequest, GenerateResponse, Provider } from "@evalboard/providers";
import { describe, expect, it } from "vitest";
import {
  PerformanceGrader,
  ShadowRunner,
  SimilarityGrader,
  exportToPromptfooYaml,
  formatShadowReportTable,
  importPromptfooConfig,
  loadPromptfooConfigFile,
  mapPromptfooAssertion,
  mapPromptfooProvider,
  parsePromptfooConfigString,
} from "./index.js";

describe("Promptfoo Schema & Config Parser", () => {
  it("parses minimal promptfooconfig correctly", () => {
    const yaml = `
description: "Test Suite"
prompts:
  - "Hello {{name}}"
providers:
  - "openai:gpt-4o-mini"
tests:
  - vars:
      name: "World"
    assert:
      - type: equals
        value: "Hello World"
`;
    const config = parsePromptfooConfigString(yaml);
    expect(config.description).toBe("Test Suite");
    expect(config.prompts).toHaveLength(1);
    expect(config.providers).toEqual(["openai:gpt-4o-mini"]);
    expect(config.tests).toHaveLength(1);
  });

  it("parses object prompts, provider objects, and defaultTest", () => {
    const yaml = `
prompts:
  - id: prompt1
    raw: "Translate {{text}} to French"
providers:
  - id: "anthropic:claude-3-5-sonnet"
    config:
      temperature: 0.2
defaultTest:
  assert:
    - type: icontains
      value: "bonjour"
tests:
  - vars:
      text: "hello"
`;
    const config = parsePromptfooConfigString(yaml);
    expect(config.prompts[0]).toEqual({ id: "prompt1", raw: "Translate {{text}} to French" });
    expect(config.providers[0]).toEqual({
      id: "anthropic:claude-3-5-sonnet",
      config: { temperature: 0.2 },
    });
    expect(config.defaultTest?.assert).toHaveLength(1);
  });

  it("loads config and resolves external file:// prompt templates and tests files", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "promptfoo-test-"));
    const promptPath = path.join(tempDir, "prompt.txt");
    const testsPath = path.join(tempDir, "tests.yaml");
    const configPath = path.join(tempDir, "promptfooconfig.yaml");

    await fs.writeFile(promptPath, "Summarize: {{text}}", "utf-8");
    await fs.writeFile(
      testsPath,
      `- vars:\n    text: "AI evaluation"\n  assert:\n    - type: contains\n      value: "eval"`,
      "utf-8",
    );

    const configContent = `
prompts:
  - file://prompt.txt
providers:
  - mock:echo
tests: file://tests.yaml
`;
    await fs.writeFile(configPath, configContent, "utf-8");

    const { config, resolvedPrompts, warnings } = await loadPromptfooConfigFile(configPath);
    expect(warnings).toHaveLength(0);
    expect(resolvedPrompts[0]).toBe("Summarize: {{text}}");
    expect(Array.isArray(config.tests)).toBe(true);
    expect(config.tests).toHaveLength(1);

    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });
});

describe("Assertion Mapping & Compatibility Warnings", () => {
  it("maps equals and not-equals assertions", () => {
    const equalsResult = mapPromptfooAssertion({ type: "equals", value: "Exact 42" });
    expect(equalsResult.grader?.type).toBe("exact");
    expect(equalsResult.grader?.config.expected).toBe("Exact 42");

    const notEqualsResult = mapPromptfooAssertion({ type: "not-equals", value: "Forbidden" });
    expect(notEqualsResult.grader?.type).toBe("regex");
    expect(notEqualsResult.grader?.config.inverted).toBe(true);
  });

  it("maps contains, icontains, and not-contains assertions", () => {
    const containsRes = mapPromptfooAssertion({ type: "contains", value: "foo" });
    expect(containsRes.grader?.type).toBe("contains");
    expect(containsRes.grader?.config.caseFold).toBe(false);

    const icontainsRes = mapPromptfooAssertion({ type: "icontains", value: "FOO" });
    expect(icontainsRes.grader?.type).toBe("contains");
    expect(icontainsRes.grader?.config.caseFold).toBe(true);

    const notContainsRes = mapPromptfooAssertion({ type: "not-contains", value: "secret" });
    expect(notContainsRes.grader?.type).toBe("not-contains");
    expect(notContainsRes.grader?.config.inverted).toBe(true);
  });

  it("maps contains-all and contains-any assertions", () => {
    const allRes = mapPromptfooAssertion({ type: "contains-all", value: ["alpha", "beta"] });
    expect(allRes.grader?.type).toBe("contains");
    expect(allRes.grader?.config.mode).toBe("all");
    expect(allRes.grader?.config.values).toEqual(["alpha", "beta"]);

    const anyRes = mapPromptfooAssertion({ type: "contains-any", value: ["cat", "dog"] });
    expect(anyRes.grader?.type).toBe("contains");
    expect(anyRes.grader?.config.mode).toBe("any");
  });

  it("maps regex, not-regex, and starts-with assertions", () => {
    const regexRes = mapPromptfooAssertion({ type: "regex", value: "^[A-Z]{3}$" });
    expect(regexRes.grader?.type).toBe("regex");
    expect(regexRes.grader?.config.pattern).toBe("^[A-Z]{3}$");

    const notRegexRes = mapPromptfooAssertion({ type: "not-regex", value: "error" });
    expect(notRegexRes.grader?.type).toBe("regex");
    expect(notRegexRes.grader?.config.inverted).toBe(true);

    const startsRes = mapPromptfooAssertion({ type: "starts-with", value: "Dear" });
    expect(startsRes.grader?.type).toBe("regex");
    expect(startsRes.grader?.config.pattern).toBe("^Dear");
  });

  it("maps is-json and json-schema assertions", () => {
    const jsonRes = mapPromptfooAssertion({ type: "is-json" });
    expect(jsonRes.grader?.type).toBe("json-schema");

    const schemaRes = mapPromptfooAssertion({
      type: "json-schema",
      value: { type: "object", properties: { score: { type: "number" } }, required: ["score"] },
    });
    expect(schemaRes.grader?.type).toBe("json-schema");
    expect(schemaRes.grader?.config.schema).toHaveProperty("required");
  });

  it("maps llm-rubric, model-graded-closedqa, and factuality", () => {
    const rubricRes = mapPromptfooAssertion({
      type: "llm-rubric",
      value: "Response is polite",
      provider: "openai:gpt-4o",
      threshold: 0.8,
    });
    expect(rubricRes.grader?.type).toBe("llm-rubric");
    expect(rubricRes.grader?.judgeModel?.provider).toBe("openai");

    const closedQaRes = mapPromptfooAssertion({
      type: "model-graded-closedqa",
      value: "Paris is capital of France",
    });
    expect(closedQaRes.grader?.type).toBe("llm-rubric");
  });

  it("maps similar, cost, and latency assertions", () => {
    const similarRes = mapPromptfooAssertion({
      type: "similar",
      value: "Golden Retriever",
      threshold: 0.75,
    });
    expect(similarRes.grader?.type).toBe("similar");
    expect(similarRes.grader?.config.threshold).toBe(0.75);

    const costRes = mapPromptfooAssertion({ type: "cost", threshold: 0.005 });
    expect(costRes.grader?.type).toBe("performance-cost");
    expect(costRes.grader?.config.maxThreshold).toBe(0.005);

    const latRes = mapPromptfooAssertion({ type: "latency", threshold: 1200 });
    expect(latRes.grader?.type).toBe("performance-latency");
    expect(latRes.grader?.config.maxThreshold).toBe(1200);
  });

  it("emits explicit warnings for code execution (javascript, python), webhooks, and unknown types", () => {
    const jsRes = mapPromptfooAssertion({ type: "javascript", value: "output.length > 5" }, 0);
    expect(jsRes.warning?.code).toBe("PF_WARN_CODE_EXECUTION");
    expect(jsRes.grader).toBeUndefined();

    const pyRes = mapPromptfooAssertion({ type: "python", value: "file://eval.py" }, 1);
    expect(pyRes.warning?.code).toBe("PF_WARN_CODE_EXECUTION");

    const hookRes = mapPromptfooAssertion(
      { type: "webhook", value: "https://example.com/check" },
      2,
    );
    expect(hookRes.warning?.code).toBe("PF_WARN_WEBHOOK");

    const unknownRes = mapPromptfooAssertion({ type: "unsupported-custom-type" }, 3);
    expect(unknownRes.warning?.code).toBe("PF_WARN_UNSUPPORTED_ASSERTION");
  });

  it("maps providers and emits warning on complex plugin configs", () => {
    const simple = mapPromptfooProvider("openai:gpt-4o");
    expect(simple.modelConfig.provider).toBe("openai");
    expect(simple.modelConfig.model).toBe("gpt-4o");
    expect(simple.warning).toBeUndefined();

    const complex = mapPromptfooProvider({
      id: "ollama:llama3",
      config: { customApiHeader: "secret-token" },
    });
    expect(complex.modelConfig.provider).toBe("ollama");
    expect(complex.warning?.code).toBe("PF_WARN_COMPLEX_PROVIDER");
  });
});

describe("Deterministic Similarity & Performance Graders", () => {
  it("SimilarityGrader calculates n-gram Jaccard scores and evaluates threshold", () => {
    const grader = new SimilarityGrader({ target: "Quick brown fox", threshold: 0.75 });

    const exactMatch = grader.grade({
      case: { input: {} },
      output: "Quick brown fox",
    });
    expect(exactMatch.score).toBe(1.0);
    expect(exactMatch.pass).toBe(true);

    const slightVariation = grader.grade({
      case: { input: {} },
      output: "A quick brown fox jumps",
    });
    expect(slightVariation.score).toBeGreaterThan(0.4);

    const completelyDifferent = grader.grade({
      case: { input: {} },
      output: "Completely unrelated content",
    });
    expect(completelyDifferent.score).toBeLessThan(0.2);
    expect(completelyDifferent.pass).toBe(false);
  });

  it("PerformanceGrader evaluates latency and cost against thresholds", () => {
    const latGrader = new PerformanceGrader({ metric: "latency", maxThreshold: 500 });
    const fastCall = latGrader.grade({
      case: { input: {} },
      output: "ok",
      context: { latencyMs: 250 },
    });
    expect(fastCall.pass).toBe(true);
    expect(fastCall.score).toBe(1.0);

    const slowCall = latGrader.grade({
      case: { input: {} },
      output: "ok",
      context: { latencyMs: 800 },
    });
    expect(slowCall.pass).toBe(false);
    expect(slowCall.score).toBe(0.0);

    const costGrader = new PerformanceGrader({ metric: "cost", maxThreshold: 0.01 });
    const cheapCall = costGrader.grade({
      case: { input: {} },
      output: "ok",
      context: { costUsd: 0.005 },
    });
    expect(cheapCall.pass).toBe(true);

    const expensiveCall = costGrader.grade({
      case: { input: {} },
      output: "ok",
      context: { costUsd: 0.02 },
    });
    expect(expensiveCall.pass).toBe(false);
  });
});

describe("Promptfoo Importer & Bidirectional Exporter", () => {
  it("imports Promptfoo suite into valid Evalboard Suite, Cases, and Prompts", () => {
    const config = parsePromptfooConfigString(`
description: "Customer Support Suite"
prompts:
  - "Answer question about {{product}}: {{question}}"
providers:
  - "openai:gpt-4o"
  - "anthropic:claude-3-5-sonnet"
defaultTest:
  assert:
    - type: icontains
      value: "support"
tests:
  - description: "Refund request"
    vars:
      product: "widget"
      question: "How do I get a refund?"
    assert:
      - type: contains
        value: "refund"
  - description: "Pricing inquiry"
    vars:
      product: "gadget"
      question: "What is the price?"
    assert:
      - type: regex
        value: "\\\\$[0-9]+"
`);

    const result = importPromptfooConfig(config, { suiteName: "Migrated Suite", repeats: 2 });
    expect(result.suite.name).toBe("Migrated Suite");
    expect(result.suite.models).toHaveLength(2);
    expect(result.suite.baseline.model).toBe("gpt-4o");
    expect(result.cases).toHaveLength(2);
    expect(result.prompts).toHaveLength(1);
    expect(result.cases[0]?.input).toEqual({
      product: "widget",
      question: "How do I get a refund?",
    });
    expect(result.cases[0]?.metadata).toEqual({ description: "Refund request" });
    expect(result.graders.length).toBeGreaterThanOrEqual(2);
  });

  it("exports Evalboard Suite and Cases back to valid Promptfoo YAML", () => {
    const importRes = importPromptfooConfig(
      parsePromptfooConfigString(`
prompts:
  - "Echo {{val}}"
providers:
  - "mock:echo"
tests:
  - vars:
      val: "hello"
    assert:
      - type: equals
        value: "hello"
`),
    );

    const exportedYaml = exportToPromptfooYaml(importRes.suite, importRes.cases, {
      prompt_1: "Echo {{val}}",
    });

    expect(exportedYaml).toContain("Echo {{val}}");
    expect(exportedYaml).toContain("mock:echo");
    expect(exportedYaml).toContain("equals");

    // Verify exported YAML can be parsed back by Promptfoo parser
    const reParsed = parsePromptfooConfigString(exportedYaml);
    expect(reParsed.prompts).toHaveLength(1);
    expect(reParsed.providers).toEqual(["mock:echo"]);
  });
});

describe("Shadow Execution Mode (Flaky Test & Statistical Divergence Detection)", () => {
  it("exposes false passes when single-shot pass fails under stochastic repeats", async () => {
    const config = parsePromptfooConfigString(`
prompts:
  - "Generate status for {{service}}"
providers:
  - "mock:flaky"
tests:
  - description: "Always stable case"
    vars:
      service: "database"
    assert:
      - type: contains
        value: "UP"
  - description: "Stochastic flaky case"
    vars:
      service: "payment"
    assert:
      - type: contains
        value: "UP"
`);

    let callCount = 0;
    // Mock provider that returns "UP" on repeat 0, but "DOWN" on repeats 1 and 2 for "payment"
    const mockProvider: Provider = {
      name: "mock-flaky",
      async generate(req: GenerateRequest): Promise<GenerateResponse> {
        callCount++;
        const content = req.messages[0]?.content ?? "";
        if (content.includes("database")) {
          return {
            text: "Status: UP (healthy)",
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: 0.0001 },
            latencyMs: 80,
            cached: false,
          };
        }
        // For payment: Alternate between UP and DOWN based on seed/call
        const isTurn1 = req.params?.seed === 42 || req.params?.temperature === 0.0;
        return {
          text: isTurn1 ? "Status: UP" : "Status: DOWN (error)",
          usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: 0.0001 },
          latencyMs: 95,
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

    const runner = new ShadowRunner(config);
    const report = await runner.run({
      repeats: 3,
      customProvider: mockProvider,
    });

    expect(report.totalCases).toBe(2);
    expect(report.repeats).toBe(3);

    // Promptfoo 1-Shot reported 100% pass (2/2) on Turn 1!
    expect(report.promptfooPassRate).toBe(1.0);

    // Evalboard stochastic repeated pass rate is lower (4/6 = 66.7%)
    expect(report.evalboardPassRate).toBeLessThan(1.0);

    // False pass was detected on the flaky payment case!
    expect(report.falsePassCount).toBe(1);
    expect(report.falsePasses[0]?.description).toBe("Stochastic flaky case");
    expect(report.falsePasses[0]?.failureCount).toBeGreaterThan(0);

    // Wilson confidence intervals are calculated
    expect(report.evalboardCi.lower).toBeDefined();
    expect(report.evalboardCi.upper).toBeDefined();

    // Table formatter generates clean readable summary
    const formattedTable = formatShadowReportTable(report);
    expect(formattedTable).toContain("EVALBOARD PROMPTFOO SHADOW RUN EXECUTION REPORT");
    expect(formattedTable).toContain("False Passes Detected:");
    expect(formattedTable).toContain("Stochastic flaky case");
  });

  it("calculates paired 4-way statistical verdict when baselineModel is provided", async () => {
    const config = parsePromptfooConfigString(`
prompts:
  - "Hello {{name}}"
providers:
  - "mock:candidate"
tests:
  - vars: { name: "Alice" }
    assert: [{ type: equals, value: "Hello Alice" }]
  - vars: { name: "Bob" }
    assert: [{ type: equals, value: "Hello Bob" }]
  - vars: { name: "Charlie" }
    assert: [{ type: equals, value: "Hello Charlie" }]
`);

    // Candidate model always matches
    const candidateProvider: Provider = {
      name: "mock-candidate",
      async generate(req: GenerateRequest): Promise<GenerateResponse> {
        const text = req.messages[0]?.content ?? "";
        return {
          text,
          usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: 0.0001 },
          latencyMs: 50,
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
        return 0;
      },
    };

    // Baseline model produces bad output
    const baselineProvider: Provider = {
      name: "mock-baseline",
      async generate(): Promise<GenerateResponse> {
        return {
          text: "Invalid response",
          usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10, costUsd: 0.0001 },
          latencyMs: 50,
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
        return 0;
      },
    };

    const runner = new ShadowRunner(config);
    const report = await runner.run({
      repeats: 2,
      model: "mock:candidate",
      baselineModel: "mock:baseline",
      customProvider: candidateProvider,
      customBaselineProvider: baselineProvider,
    });

    expect(report.verdict).toBeDefined();
    expect(report.verdict?.verdict).toBe("BETTER");
    expect(report.verdict?.d).toBe(1.0); // 100% improvement
  });
});
