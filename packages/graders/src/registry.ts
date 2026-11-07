import { getCustomGrader } from "./custom.js";
import { ContainsGrader } from "./deterministic/contains.js";
import { ExactGrader } from "./deterministic/exact.js";
import { JsonSchemaGrader } from "./deterministic/json-schema.js";
import { LengthConstraintGrader } from "./deterministic/length.js";
import { NumericGrader } from "./deterministic/numeric.js";
import { RegexGrader } from "./deterministic/regex.js";
import { SetMatchGrader } from "./deterministic/set-match.js";
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

/**
 * Creates a Grader instance given a type and configuration.
 * Dispatches to built-in deterministic graders or registered custom graders.
 */
export function createGrader(type: string, config: unknown): Grader {
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

    default: {
      const customFactory = getCustomGrader(type);
      if (customFactory) {
        return customFactory(config);
      }

      throw new Error(
        `Unknown grader type: '${type}'. Built-in deterministic types are: [${BUILTIN_DETERMINISTIC_GRADERS.join(
          ", ",
        )}]. For custom types, register via 'registerCustomGrader'.`,
      );
    }
  }
}
