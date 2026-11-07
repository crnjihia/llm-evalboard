import { hashGraderContent } from "@evalboard/core";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const exactGraderConfigSchema = z.object({
  expected: z.string().optional(),
  trim: z.boolean().default(true),
  caseFold: z.boolean().default(false),
  unicodeNormalize: z.enum(["NFC", "NFD", "NFKC", "NFKD"]).or(z.literal(false)).default("NFC"),
  whitespaceCollapse: z.boolean().default(false),
  extractor: extractorConfigSchema.optional(),
});

export type ExactGraderConfig = z.infer<typeof exactGraderConfigSchema>;

export class ExactGrader implements Grader<ExactGraderConfig> {
  public readonly type = "exact";
  public readonly versionId: string;
  public readonly config: ExactGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = exactGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as Record<string, unknown>,
    });
  }

  private normalize(str: string): string {
    let result = str;

    if (this.config.unicodeNormalize) {
      result = result.normalize(this.config.unicodeNormalize);
    }

    if (this.config.whitespaceCollapse) {
      result = result.replace(/\s+/g, " ");
    }

    if (this.config.caseFold) {
      result = result.toLowerCase();
    }

    if (this.config.trim) {
      result = result.trim();
    }

    return result;
  }

  grade(input: GradeInput): GraderOutcome {
    const rawExpected =
      this.config.expected !== undefined
        ? this.config.expected
        : input.case.expected !== undefined && input.case.expected !== null
          ? String(input.case.expected)
          : "";

    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const normalizedExpected = this.normalize(rawExpected);
    const normalizedReceived = this.normalize(extractedOutput);

    const match = normalizedReceived === normalizedExpected;

    return {
      score: match ? 1 : 0,
      pass: match,
      reason: match
        ? "Exact match succeeded"
        : `Exact match failed: expected '${normalizedExpected}', received '${normalizedReceived}'`,
      details: {
        rawExpected,
        rawOutput: input.output,
        extractedOutput,
        normalizedExpected,
        normalizedReceived,
      },
    };
  }
}
