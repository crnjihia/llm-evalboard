import type { Case, GraderConfig, ModelConfig, Suite } from "@evalboard/core";
import { stringify as stringifyYaml } from "yaml";
import type { PromptfooAssertion, PromptfooConfig, PromptfooTestCase } from "./schema.js";

function graderToPromptfooAssertion(grader: GraderConfig): PromptfooAssertion | null {
  const config = grader.config ?? {};

  switch (grader.type) {
    case "exact": {
      return {
        type: "equals",
        value: config.expected !== undefined ? config.expected : "{{expected}}",
      };
    }

    case "contains": {
      const values = Array.isArray(config.values) ? (config.values as string[]) : [];
      const mode = config.mode ?? "all";
      const inverted = Boolean(config.inverted);

      if (inverted) {
        return {
          type: "not-contains",
          value: values[0] ?? "",
        };
      }
      if (values.length > 1) {
        return {
          type: mode === "any" ? "contains-any" : "contains-all",
          value: values,
        };
      }
      return {
        type: "contains",
        value: values[0] ?? "",
      };
    }

    case "not-contains": {
      const values = Array.isArray(config.values) ? (config.values as string[]) : [];
      return {
        type: "not-contains",
        value: values[0] ?? "",
      };
    }

    case "regex": {
      const pattern = String(config.pattern ?? "");
      const inverted = Boolean(config.inverted);
      return {
        type: inverted ? "not-regex" : "regex",
        value: pattern,
      };
    }

    case "json-schema": {
      return {
        type: "json-schema",
        value: config.schema ?? { type: "object" },
      };
    }

    case "llm-rubric": {
      const rubricList = Array.isArray(config.rubric) ? config.rubric : [];
      const firstRubric = (rubricList[0] as Record<string, unknown>) ?? {};
      const description = String(firstRubric.description ?? grader.name ?? "Quality evaluation");
      const judgeModel = grader.judgeModel as ModelConfig | undefined;
      return {
        type: "llm-rubric",
        value: description,
        provider: judgeModel ? `${judgeModel.provider}:${judgeModel.model}` : undefined,
        threshold: typeof config.passThreshold === "number" ? config.passThreshold : 0.7,
      };
    }

    case "similar": {
      return {
        type: "similar",
        value: config.target ?? "{{expected}}",
        threshold: typeof config.threshold === "number" ? config.threshold : 0.8,
      };
    }

    case "performance-cost": {
      return {
        type: "cost",
        threshold: typeof config.maxThreshold === "number" ? config.maxThreshold : 0.01,
      };
    }

    case "performance-latency": {
      return {
        type: "latency",
        threshold: typeof config.maxThreshold === "number" ? config.maxThreshold : 2000,
      };
    }

    default:
      return null;
  }
}

/**
 * Converts an Evalboard Suite and test Cases back to a Promptfoo YAML configuration string.
 */
export function exportToPromptfooYaml(
  suite: Suite,
  cases: Case[] = [],
  promptTemplates: Record<string, string> = {},
): string {
  // Convert prompts
  const prompts = suite.prompts.map((p) => {
    return promptTemplates[p] ?? p;
  });

  // Convert providers
  const providers = suite.models.map((m) => {
    return `${m.provider}:${m.model}`;
  });

  // Convert default assertions from suite graders
  const defaultAsserts: PromptfooAssertion[] = [];
  for (const g of suite.graders) {
    const assertion = graderToPromptfooAssertion(g);
    if (assertion) {
      defaultAsserts.push(assertion);
    }
  }

  // Convert test cases
  const tests: PromptfooTestCase[] = cases.map((c) => {
    const testCase: PromptfooTestCase = {
      vars: c.input,
      assert: defaultAsserts.map((a) => {
        // If assertion expects {{expected}}, replace with case.expected
        if (a.value === "{{expected}}" && c.expected !== undefined && c.expected !== null) {
          return { ...a, value: String(c.expected) };
        }
        return a;
      }),
      tags: c.tags,
    };

    if (c.metadata && typeof c.metadata === "object") {
      const meta = c.metadata as Record<string, unknown>;
      if (typeof meta.description === "string") {
        testCase.description = meta.description;
      }
    }

    return testCase;
  });

  const promptfooConfig: PromptfooConfig = {
    description: suite.name,
    prompts,
    providers,
    defaultTest:
      defaultAsserts.length > 0 ? { vars: {}, assert: defaultAsserts, tags: [] } : undefined,
    tests: tests.length > 0 ? tests : [],
  };

  return stringifyYaml(promptfooConfig);
}
