import { hashGraderContent } from "@evalboard/core";
import type { GradeInput, Grader, GraderOutcome } from "@evalboard/graders";
import { z } from "zod";

export const similarityGraderConfigSchema = z.object({
  target: z.string().default(""),
  threshold: z.number().min(0).max(1).default(0.8),
  nGramSize: z.number().int().positive().default(2),
  caseFold: z.boolean().default(true),
});

export type SimilarityGraderConfig = z.infer<typeof similarityGraderConfigSchema>;

/**
 * Computes character or word n-gram Jaccard similarity between two strings.
 */
export function computeNGramSimilarity(
  textA: string,
  textB: string,
  n = 2,
  caseFold = true,
): number {
  const a = caseFold ? textA.toLowerCase().trim() : textA.trim();
  const b = caseFold ? textB.toLowerCase().trim() : textB.trim();

  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  // For very short strings where length < n
  if (a.length < n || b.length < n) {
    return a === b ? 1.0 : 0.0;
  }

  const getGrams = (str: string): Set<string> => {
    const grams = new Set<string>();
    for (let i = 0; i <= str.length - n; i++) {
      grams.add(str.slice(i, i + n));
    }
    return grams;
  };

  const gramsA = getGrams(a);
  const gramsB = getGrams(b);

  let intersection = 0;
  for (const g of gramsA) {
    if (gramsB.has(g)) {
      intersection++;
    }
  }

  const union = gramsA.size + gramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export class SimilarityGrader implements Grader<SimilarityGraderConfig> {
  public readonly type = "similar";
  public readonly versionId: string;
  public readonly config: SimilarityGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = similarityGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  grade(input: GradeInput): GraderOutcome {
    const expected =
      this.config.target || (typeof input.case.expected === "string" ? input.case.expected : "");

    const score = computeNGramSimilarity(
      input.output,
      expected,
      this.config.nGramSize,
      this.config.caseFold,
    );

    const pass = score >= this.config.threshold;
    return {
      score,
      pass,
      reason: pass
        ? `Similarity ${score.toFixed(3)} >= threshold ${this.config.threshold.toFixed(3)}`
        : `Similarity ${score.toFixed(3)} < threshold ${this.config.threshold.toFixed(3)}`,
      details: {
        similarityScore: score,
        threshold: this.config.threshold,
        expected,
      },
    };
  }
}
