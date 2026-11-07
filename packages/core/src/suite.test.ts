import { describe, expect, it } from "vitest";
import { parseSuiteConfig } from "./suite.js";

describe("suite configuration loader", () => {
  it("parses valid YAML suite configuration", () => {
    const yamlContent = `
name: support-bot
prompts:
  - prompts/v1.md
  - prompts/v2.md
models:
  - claude-3-5-sonnet-20241022
  - ollama:llama3
  - openrouter:meta-llama/llama-3-70b-instruct
dataset: datasets/support.jsonl
repeats: 3
graders:
  - type: llm-rubric
    rubric: rubrics/helpfulness.md
    judge: claude-3-5-sonnet-20241022
  - type: json-schema
    schema: schemas/reply.json
baseline:
  prompt: v1
  model: claude-3-5-sonnet-20241022
delta: 0.03
`;

    const suite = parseSuiteConfig(yamlContent);

    expect(suite.name).toBe("support-bot");
    expect(suite.prompts).toEqual(["prompts/v1.md", "prompts/v2.md"]);
    expect(suite.repeats).toBe(3);
    expect(suite.delta).toBe(0.03);
    expect(suite.confidenceLevel).toBe(0.95);

    // Verify model normalisation
    expect(suite.models).toHaveLength(3);
    expect(suite.models[0]).toEqual({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      parameters: {},
    });
    expect(suite.models[1]).toEqual({
      provider: "ollama",
      model: "llama3",
      parameters: {},
    });
    expect(suite.models[2]).toEqual({
      provider: "openrouter",
      model: "meta-llama/llama-3-70b-instruct",
      parameters: {},
    });

    // Verify grader normalisation
    expect(suite.graders).toHaveLength(2);
    expect(suite.graders[0]?.type).toBe("llm-rubric");
    expect(suite.graders[0]?.config).toEqual({ rubric: "rubrics/helpfulness.md" });
    expect(suite.graders[0]?.judgeModel?.provider).toBe("anthropic");

    expect(suite.graders[1]?.type).toBe("json-schema");
    expect(suite.graders[1]?.config).toEqual({ schema: "schemas/reply.json" });

    // Baseline
    expect(suite.baseline).toEqual({
      prompt: "v1",
      model: "claude-3-5-sonnet-20241022",
    });
  });

  it("parses valid JavaScript/TypeScript object suite configuration", () => {
    const rawConfig = {
      name: "summarisation-eval",
      prompts: ["prompts/summary.md"],
      models: ["mock:test-model"],
      dataset: "datasets/summaries.jsonl",
      graders: [
        {
          type: "exact",
          config: { trim: true },
        },
      ],
      baseline: {
        prompt: "prompts/summary.md",
        model: "mock:test-model",
      },
    };

    const suite = parseSuiteConfig(rawConfig);
    expect(suite.name).toBe("summarisation-eval");
    expect(suite.repeats).toBe(1);
    expect(suite.delta).toBe(0.03);
    expect(suite.models[0]?.provider).toBe("mock");
  });

  it("fails with a precise, human-readable error when invalid", () => {
    const invalidConfig = {
      name: "",
      prompts: [],
      models: [],
      // missing dataset, graders, baseline
      repeats: -2,
      delta: 5.0,
    };

    expect(() => parseSuiteConfig(invalidConfig)).toThrowError(
      /Invalid suite configuration:\n.*name.*\n.*prompts.*\n.*models.*\n.*dataset.*\n.*repeats.*\n.*graders.*\n.*baseline.*\n.*delta/s,
    );
  });
});
