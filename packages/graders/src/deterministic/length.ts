import { hashGraderContent } from "@evalboard/core";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const lengthConstraintGraderConfigSchema = z.object({
  minChars: z.number().int().nonnegative().optional(),
  maxChars: z.number().int().nonnegative().optional(),
  minWords: z.number().int().nonnegative().optional(),
  maxWords: z.number().int().nonnegative().optional(),
  requiredSections: z.array(z.string()).optional(),
  forbiddenSections: z.array(z.string()).optional(),
  extractor: extractorConfigSchema.optional(),
});

export type LengthConstraintGraderConfig = z.infer<typeof lengthConstraintGraderConfigSchema>;

export class LengthConstraintGrader implements Grader<LengthConstraintGraderConfig> {
  public readonly type = "length-constraint";
  public readonly versionId: string;
  public readonly config: LengthConstraintGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = lengthConstraintGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  grade(input: GradeInput): GraderOutcome {
    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const charCount = extractedOutput.length;
    const words = extractedOutput.trim().split(/\s+/).filter(Boolean);
    const wordCount = extractedOutput.trim().length === 0 ? 0 : words.length;

    const violations: string[] = [];

    if (this.config.minChars !== undefined && charCount < this.config.minChars) {
      violations.push(`Character count (${charCount}) is below minimum (${this.config.minChars})`);
    }

    if (this.config.maxChars !== undefined && charCount > this.config.maxChars) {
      violations.push(`Character count (${charCount}) exceeds maximum (${this.config.maxChars})`);
    }

    if (this.config.minWords !== undefined && wordCount < this.config.minWords) {
      violations.push(`Word count (${wordCount}) is below minimum (${this.config.minWords})`);
    }

    if (this.config.maxWords !== undefined && wordCount > this.config.maxWords) {
      violations.push(`Word count (${wordCount}) exceeds maximum (${this.config.maxWords})`);
    }

    if (this.config.requiredSections && this.config.requiredSections.length > 0) {
      for (const section of this.config.requiredSections) {
        if (!extractedOutput.includes(section)) {
          violations.push(`Missing required section header: '${section}'`);
        }
      }
    }

    if (this.config.forbiddenSections && this.config.forbiddenSections.length > 0) {
      for (const section of this.config.forbiddenSections) {
        if (extractedOutput.includes(section)) {
          violations.push(`Found forbidden section header: '${section}'`);
        }
      }
    }

    const pass = violations.length === 0;
    const score = pass ? 1 : 0;
    const reason = pass
      ? `Length and format constraints passed (${wordCount} words, ${charCount} chars)`
      : `Format constraints failed: ${violations.join("; ")}`;

    return {
      score,
      pass,
      reason,
      details: {
        charCount,
        wordCount,
        violations,
        extractedOutput,
      },
    };
  }
}
