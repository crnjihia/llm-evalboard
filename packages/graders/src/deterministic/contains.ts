import { hashGraderContent } from "@evalboard/core";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const containsGraderConfigSchema = z.object({
  values: z
    .string()
    .or(z.array(z.string()))
    .transform((v) => (Array.isArray(v) ? v : [v])),
  mode: z.enum(["all", "any"]).default("all"),
  inverted: z.boolean().default(false), // true for not-contains
  caseFold: z.boolean().default(false),
  trim: z.boolean().default(false),
  extractor: extractorConfigSchema.optional(),
});

export type ContainsGraderConfig = z.infer<typeof containsGraderConfigSchema>;

export class ContainsGrader implements Grader<ContainsGraderConfig> {
  public readonly type: string;
  public readonly versionId: string;
  public readonly config: ContainsGraderConfig;

  constructor(rawConfig: unknown, type: "contains" | "not-contains" = "contains") {
    const parsed = containsGraderConfigSchema.parse(rawConfig ?? {});
    // If constructed as "not-contains", invert by default unless overridden
    if (
      type === "not-contains" &&
      rawConfig &&
      typeof rawConfig === "object" &&
      !("inverted" in rawConfig)
    ) {
      parsed.inverted = true;
    }
    this.type = type;
    this.config = parsed;
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  private normalize(str: string): string {
    let result = str;
    if (this.config.caseFold) {
      result = result.toLowerCase();
    }
    if (this.config.trim) {
      result = result.trim();
    }
    return result;
  }

  grade(input: GradeInput): GraderOutcome {
    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const normalizedTarget = this.normalize(extractedOutput);

    const values =
      this.config.values.length > 0
        ? this.config.values
        : input.case.expected !== undefined
          ? [String(input.case.expected)]
          : [];

    const found: string[] = [];
    const missing: string[] = [];

    for (const val of values) {
      const normalizedVal = this.normalize(val);
      if (normalizedTarget.includes(normalizedVal)) {
        found.push(val);
      } else {
        missing.push(val);
      }
    }

    let pass = false;
    let reason = "";

    if (!this.config.inverted) {
      // Normal "contains"
      if (this.config.mode === "all") {
        pass = missing.length === 0;
        reason = pass
          ? `Found all expected substrings: [${values.join(", ")}]`
          : `Missing expected substrings: [${missing.join(", ")}]`;
      } else {
        // mode === "any"
        pass = found.length > 0;
        reason = pass
          ? `Found at least one expected substring: [${found.join(", ")}]`
          : `Did not find any of expected substrings: [${values.join(", ")}]`;
      }
    } else {
      // Inverted "not-contains"
      if (this.config.mode === "all") {
        // Passes if none of the forbidden values are present
        pass = found.length === 0;
        reason = pass
          ? `None of forbidden substrings were found: [${values.join(", ")}]`
          : `Found forbidden substrings: [${found.join(", ")}]`;
      } else {
        // mode === "any" for inverted means missing at least one
        pass = missing.length > 0;
        reason = pass
          ? `Did not find all forbidden substrings; missing: [${missing.join(", ")}]`
          : `All forbidden substrings were found: [${found.join(", ")}]`;
      }
    }

    const score = pass ? 1 : 0;

    return {
      score,
      pass,
      reason,
      details: {
        mode: this.config.mode,
        inverted: this.config.inverted,
        values,
        found,
        missing,
        extractedOutput,
      },
    };
  }
}
