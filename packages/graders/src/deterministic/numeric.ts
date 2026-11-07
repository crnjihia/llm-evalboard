import { hashGraderContent } from "@evalboard/core";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const numericGraderConfigSchema = z.object({
  target: z.number().optional(),
  tolerance: z.number().nonnegative().default(0),
  toleranceType: z.enum(["absolute", "relative"]).default("absolute"),
  extractor: extractorConfigSchema.optional(),
});

export type NumericGraderConfig = z.infer<typeof numericGraderConfigSchema>;

export class NumericGrader implements Grader<NumericGraderConfig> {
  public readonly type = "numeric";
  public readonly versionId: string;
  public readonly config: NumericGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = numericGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  private extractNumber(text: string): number | null {
    // Remove currency symbols, commas in numbers (e.g. 1,000.50 -> 1000.50)
    const cleaned = text.replace(/[$€£¥]/g, "").trim();

    // Match floating point numbers (including scientific notation or negatives)
    const match = cleaned.match(/[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:[eE][-+]?\d+)?/);
    if (!match?.[0]) {
      return null;
    }

    const uncomma = match[0].replace(/,/g, "");
    const val = Number.parseFloat(uncomma);
    return Number.isFinite(val) ? val : null;
  }

  grade(input: GradeInput): GraderOutcome {
    const rawExpected =
      this.config.target !== undefined
        ? this.config.target
        : typeof input.case.expected === "number"
          ? input.case.expected
          : typeof input.case.expected === "string"
            ? Number.parseFloat(input.case.expected)
            : null;

    if (rawExpected === null || !Number.isFinite(rawExpected)) {
      return {
        score: 0,
        pass: false,
        reason: "No valid numeric target specified in config or test case expected field",
      };
    }

    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const receivedValue = this.extractNumber(extractedOutput);

    if (receivedValue === null) {
      return {
        score: 0,
        pass: false,
        reason: `Could not parse numeric value from output: '${extractedOutput}'`,
        details: {
          rawOutput: input.output,
          extractedOutput,
          target: rawExpected,
        },
      };
    }

    const diff = Math.abs(receivedValue - rawExpected);
    const { tolerance, toleranceType } = this.config;

    let pass = false;
    let allowedDiff = tolerance;

    if (toleranceType === "absolute") {
      pass = diff <= tolerance;
    } else {
      // relative tolerance
      allowedDiff = Math.abs(rawExpected) * tolerance;
      pass = diff <= allowedDiff;
    }

    const score = pass ? 1 : 0;
    const diffStr = diff.toFixed(4);
    const allowedStr = allowedDiff.toFixed(4);

    const reason = pass
      ? `Value ${receivedValue} matches target ${rawExpected} within ${toleranceType} tolerance (diff: ${diffStr} <= ${allowedStr})`
      : `Value ${receivedValue} outside ${toleranceType} tolerance of target ${rawExpected} (diff: ${diffStr} > ${allowedStr})`;

    return {
      score,
      pass,
      reason,
      details: {
        target: rawExpected,
        received: receivedValue,
        diff,
        tolerance,
        toleranceType,
        allowedDiff,
      },
    };
  }
}
