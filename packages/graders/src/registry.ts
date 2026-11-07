import type { Provider } from "@evalboard/providers";
import { getCustomGrader } from "./custom.js";
import { ContainsGrader } from "./deterministic/contains.js";
import { ExactGrader } from "./deterministic/exact.js";
import { JsonSchemaGrader } from "./deterministic/json-schema.js";
import { LengthConstraintGrader } from "./deterministic/length.js";
import { NumericGrader } from "./deterministic/numeric.js";
import { RegexGrader } from "./deterministic/regex.js";
import { SetMatchGrader } from "./deterministic/set-match.js";
import { PairwiseJudge } from "./llm/pairwise.js";
import { RubricJudge } from "./llm/rubric.js";
import type { Grader } from "./types.js";

export const BUILTIN_DETERMINISTIC_GRADERS = [
  "exact",
  "contains",
  "not-contains",
  "regex",
  "json-schema",
  "numeric",
  "set-match",
  "length-constraint",
] as const;

export const BUILTIN_LLM_GRADERS = ["llm-rubric", "pairwise"] as const;

export const ALL_BUILTIN_GRADERS = [
  ...BUILTIN_DETERMINISTIC_GRADERS,
  ...BUILTIN_LLM_GRADERS,
] as const;

/**
 * Creates a Grader instance given a type and configuration.
 * Dispatches to built-in deterministic graders, LLM judges, or registered custom graders.
 */
export function createGrader(
  type: string,
  config: unknown,
  providerResolver?: (provider: string, model: string) => Provider,
): Grader {
  switch (type) {
    case "exact":
      return new ExactGrader(config);

    case "contains":
      return new ContainsGrader(config, "contains");

    case "not-contains":
      return new ContainsGrader(config, "not-contains");

    case "regex":
      return new RegexGrader(config);

    case "json-schema":
      return new JsonSchemaGrader(config);

    case "numeric":
      return new NumericGrader(config);

    case "set-match":
      return new SetMatchGrader(config);

    case "length-constraint":
      return new LengthConstraintGrader(config);

    case "llm-rubric":
      return new RubricJudge(config, providerResolver);

    case "pairwise":
      return new PairwiseJudge(config, providerResolver);

    default: {
      const customFactory = getCustomGrader(type);
      if (customFactory) {
        return customFactory(config);
      }

      throw new Error(
        `Unknown grader type: '${type}'. Built-in types are: [${ALL_BUILTIN_GRADERS.join(
          ", ",
        )}]. For custom types, register via 'registerCustomGrader'.`,
      );
    }
  }
}
