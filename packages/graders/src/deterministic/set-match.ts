import { hashGraderContent } from "@evalboard/core";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const setMatchGraderConfigSchema = z.object({
  expected: z.array(z.string().or(z.number())).optional(),
  caseFold: z.boolean().default(true),
  trim: z.boolean().default(true),
  metric: z.enum(["f1", "precision", "recall", "exact"]).default("f1"),
  threshold: z.number().min(0).max(1).default(1.0),
  extractor: extractorConfigSchema.optional(),
});

export type SetMatchGraderConfig = z.infer<typeof setMatchGraderConfigSchema>;

export class SetMatchGrader implements Grader<SetMatchGraderConfig> {
  public readonly type = "set-match";
  public readonly versionId: string;
  public readonly config: SetMatchGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = setMatchGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  private normalizeItem(item: unknown): string {
    let str = String(item);
    if (this.config.caseFold) {
      str = str.toLowerCase();
    }
    if (this.config.trim) {
      str = str.trim();
    }
    return str;
  }

  private parseItems(text: string): string[] {
    const trimmed = text.trim();

    // Check if JSON array
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((x) => this.normalizeItem(x)).filter(Boolean);
        }
      } catch {
        // Fall back to text parsing
      }
    }

    // Check line by line (e.g. Markdown bullet points or numbered lists)
    const lines = trimmed
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const bulletRegex = /^[-*•\d+.)\]\s]+/;

    const extractedFromLines: string[] = [];
    for (const line of lines) {
      const stripped = line.replace(bulletRegex, "").trim();
      if (stripped.length > 0) {
        extractedFromLines.push(this.normalizeItem(stripped));
      }
    }

    if (extractedFromLines.length > 1) {
      return extractedFromLines;
    }

    // Fall back to comma or semicolon separation
    return trimmed
      .split(/[,;]/)
      .map((item) => this.normalizeItem(item))
      .filter((item) => item.length > 0);
  }

  grade(input: GradeInput): GraderOutcome {
    const rawExpected =
      this.config.expected !== undefined
        ? this.config.expected
        : Array.isArray(input.case.expected)
          ? input.case.expected
          : input.case.expected !== undefined
            ? [input.case.expected]
            : [];

    const expectedSet = new Set(rawExpected.map((x) => this.normalizeItem(x)));

    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const receivedItems = this.parseItems(extractedOutput);
    const receivedSet = new Set(receivedItems);

    const truePositives: string[] = [];
    const falsePositives: string[] = [];
    const falseNegatives: string[] = [];

    for (const item of receivedSet) {
      if (expectedSet.has(item)) {
        truePositives.push(item);
      } else {
        falsePositives.push(item);
      }
    }

    for (const item of expectedSet) {
      if (!receivedSet.has(item)) {
        falseNegatives.push(item);
      }
    }

    const tp = truePositives.length;
    const fp = falsePositives.length;
    const fn = falseNegatives.length;

    const precision = tp + fp === 0 ? (expectedSet.size === 0 ? 1 : 0) : tp / (tp + fp);
    const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const exact = fp === 0 && fn === 0 ? 1 : 0;

    let computedScore: number;
    switch (this.config.metric) {
      case "precision":
        computedScore = precision;
        break;
      case "recall":
        computedScore = recall;
        break;
      case "f1":
        computedScore = f1;
        break;
      case "exact":
        computedScore = exact;
        break;
      default:
        computedScore = f1;
    }

    // Round score to 4 decimal places
    const score = Math.round(computedScore * 10000) / 10000;
    const pass = score >= this.config.threshold;

    const reason = `Set match (${this.config.metric.toUpperCase()} = ${score.toFixed(3)}): P=${precision.toFixed(2)}, R=${recall.toFixed(2)}, F1=${f1.toFixed(2)} | Overlap: ${tp}/${expectedSet.size} items (missing: ${fn}, extra: ${fp})`;

    return {
      score,
      pass,
      reason,
      details: {
        metric: this.config.metric,
        threshold: this.config.threshold,
        precision,
        recall,
        f1,
        exact,
        expectedItems: Array.from(expectedSet),
        receivedItems: Array.from(receivedSet),
        truePositives,
        falsePositives,
        falseNegatives,
      },
    };
  }
}
