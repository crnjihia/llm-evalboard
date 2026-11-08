import { type GraderConfig, type ModelConfig, normaliseModelConfig } from "@evalboard/core";
import type { PromptfooAssertion, PromptfooProvider } from "./schema.js";
import {
  type MappingWarning,
  createCodeExecutionWarning,
  createComplexProviderWarning,
  createUnsupportedAssertionWarning,
  createWebhookWarning,
} from "./warnings.js";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface AssertionMappingResult {
  grader?: GraderConfig;
  warning?: MappingWarning;
}

/**
 * Translates a single Promptfoo assertion into an Evalboard GraderConfig
 * and returns any associated compatibility warnings.
 */
export function mapPromptfooAssertion(
  assertion: PromptfooAssertion,
  caseIndex?: number,
): AssertionMappingResult {
  const type = assertion.type.trim().toLowerCase();

  switch (type) {
    case "equals": {
      const expected = String(assertion.value ?? "");
      return {
        grader: {
          type: "exact",
          name: assertion.metric ?? "exact_match",
          config: {
            expected,
            trim: true,
            caseFold: false,
          },
        },
      };
    }

    case "not-equals": {
      const notExpected = String(assertion.value ?? "");
      return {
        grader: {
          type: "regex",
          name: assertion.metric ?? "not_equals",
          config: {
            pattern: `^${escapeRegex(notExpected)}$`,
            flags: "s",
            inverted: true,
          },
        },
      };
    }

    case "contains": {
      const val = String(assertion.value ?? "");
      return {
        grader: {
          type: "contains",
          name: assertion.metric ?? "contains",
          config: {
            values: [val],
            mode: "all",
            inverted: false,
            caseFold: false,
          },
        },
      };
    }

    case "icontains": {
      const val = String(assertion.value ?? "");
      return {
        grader: {
          type: "contains",
          name: assertion.metric ?? "icontains",
          config: {
            values: [val],
            mode: "all",
            inverted: false,
            caseFold: true,
          },
        },
      };
    }

    case "not-contains": {
      const val = String(assertion.value ?? "");
      return {
        grader: {
          type: "not-contains",
          name: assertion.metric ?? "not_contains",
          config: {
            values: [val],
            mode: "all",
            inverted: true,
            caseFold: false,
          },
        },
      };
    }

    case "not-icontains": {
      const val = String(assertion.value ?? "");
      return {
        grader: {
          type: "not-contains",
          name: assertion.metric ?? "not_icontains",
          config: {
            values: [val],
            mode: "all",
            inverted: true,
            caseFold: true,
          },
        },
      };
    }

    case "contains-all": {
      const vals = Array.isArray(assertion.value)
        ? assertion.value.map(String)
        : [String(assertion.value ?? "")];
      return {
        grader: {
          type: "contains",
          name: assertion.metric ?? "contains_all",
          config: {
            values: vals,
            mode: "all",
            inverted: false,
            caseFold: false,
          },
        },
      };
    }

    case "contains-any": {
      const vals = Array.isArray(assertion.value)
        ? assertion.value.map(String)
        : [String(assertion.value ?? "")];
      return {
        grader: {
          type: "contains",
          name: assertion.metric ?? "contains_any",
          config: {
            values: vals,
            mode: "any",
            inverted: false,
            caseFold: false,
          },
        },
      };
    }

    case "starts-with": {
      const prefix = String(assertion.value ?? "");
      return {
        grader: {
          type: "regex",
          name: assertion.metric ?? "starts_with",
          config: {
            pattern: `^${escapeRegex(prefix)}`,
          },
        },
      };
    }

    case "regex": {
      const pattern = String(assertion.value ?? "");
      return {
        grader: {
          type: "regex",
          name: assertion.metric ?? "regex",
          config: {
            pattern,
          },
        },
      };
    }

    case "not-regex": {
      const pattern = String(assertion.value ?? "");
      return {
        grader: {
          type: "regex",
          name: assertion.metric ?? "not_regex",
          config: {
            pattern,
            inverted: true,
          },
        },
      };
    }

    case "is-json": {
      return {
        grader: {
          type: "json-schema",
          name: assertion.metric ?? "is_json",
          config: {
            schema: { type: "object" },
          },
        },
      };
    }

    case "json-schema": {
      const schema =
        typeof assertion.value === "object" && assertion.value !== null
          ? (assertion.value as Record<string, unknown>)
          : { type: "object" };
      return {
        grader: {
          type: "json-schema",
          name: assertion.metric ?? "json_schema",
          config: {
            schema,
          },
        },
      };
    }

    case "llm-rubric": {
      const rubricText = String(assertion.value ?? "Verify response fulfills requirements");
      const judgeModel = normaliseModelConfig(
        typeof assertion.provider === "string" ? assertion.provider : "openai:gpt-4o",
      );
      return {
        grader: {
          type: "llm-rubric",
          name: assertion.metric ?? "llm_rubric",
          config: {
            rubric: [
              {
                name: "Evaluation Rubric",
                description: rubricText,
                scale: "pass_fail",
                weight: assertion.weight ?? 1,
              },
            ],
            passThreshold: assertion.threshold ?? 0.7,
            judgeModel,
          },
          judgeModel,
        },
      };
    }

    case "model-graded-closedqa":
    case "factuality": {
      const statement = String(assertion.value ?? "");
      const judgeModel = normaliseModelConfig(
        typeof assertion.provider === "string" ? assertion.provider : "openai:gpt-4o",
      );
      return {
        grader: {
          type: "llm-rubric",
          name: assertion.metric ?? type.replace(/-/g, "_"),
          config: {
            rubric: [
              {
                name: "ClosedQA Factuality",
                description: `Assess factual correctness against expected reference: ${statement}`,
                scale: "pass_fail",
                weight: 1,
              },
            ],
            passThreshold: assertion.threshold ?? 0.7,
            judgeModel,
          },
          judgeModel,
        },
      };
    }

    case "similar":
    case "cosine": {
      const target = String(assertion.value ?? "");
      const threshold = typeof assertion.threshold === "number" ? assertion.threshold : 0.8;
      return {
        grader: {
          type: "similar",
          name: assertion.metric ?? "similarity",
          config: {
            target,
            threshold,
          },
        },
      };
    }

    case "cost": {
      const threshold =
        typeof assertion.threshold === "number"
          ? assertion.threshold
          : Number(assertion.value ?? 0);
      return {
        grader: {
          type: "performance-cost",
          name: assertion.metric ?? "cost_limit",
          config: {
            metric: "cost",
            maxThreshold: threshold,
          },
        },
      };
    }

    case "latency": {
      const threshold =
        typeof assertion.threshold === "number"
          ? assertion.threshold
          : Number(assertion.value ?? 0);
      return {
        grader: {
          type: "performance-latency",
          name: assertion.metric ?? "latency_limit",
          config: {
            metric: "latency",
            maxThreshold: threshold,
          },
        },
      };
    }

    case "javascript": {
      return {
        warning: createCodeExecutionWarning("javascript", caseIndex),
      };
    }

    case "python": {
      return {
        warning: createCodeExecutionWarning("python", caseIndex),
      };
    }

    case "webhook": {
      return {
        warning: createWebhookWarning(caseIndex),
      };
    }

    default: {
      return {
        warning: createUnsupportedAssertionWarning(assertion.type, caseIndex),
      };
    }
  }
}

/**
 * Normalises a Promptfoo provider into an Evalboard ModelConfig.
 */
export function mapPromptfooProvider(provider: PromptfooProvider): {
  modelConfig: ModelConfig;
  warning?: MappingWarning;
} {
  if (typeof provider === "string") {
    return { modelConfig: normaliseModelConfig(provider) };
  }

  const id = provider.id;
  const config = provider.config ?? {};
  const warning = Object.keys(config).length > 0 ? createComplexProviderWarning(id) : undefined;

  const modelConfig = normaliseModelConfig(id);
  if (Object.keys(config).length > 0) {
    modelConfig.parameters = {
      ...(modelConfig.parameters ?? {}),
      ...config,
    };
  }

  return { modelConfig, warning };
}
