import type { DbClient } from "../client.js";
import { comparisons } from "../schema.js";

export interface SaveComparisonInput {
  runId: string;
  baselineCellId: string;
  candidateCellId: string;
  metric: string;
  baselineMean: number;
  candidateMean: number;
  diff: number;
  ciLower: number;
  ciUpper: number;
  confidenceLevel?: number;
  delta?: number;
  verdict: "BETTER" | "WORSE" | "NO_MEANINGFUL_DIFFERENCE" | "INCONCLUSIVE" | string;
  pValue?: number;
  nPairs: number;
  excludedPairs?: number;
  reasoning?: string;
  seed?: number;
}

export class ComparisonRepository {
  constructor(private readonly db: DbClient) {}

  async saveComparison(input: SaveComparisonInput) {
    const [created] = await this.db
      .insert(comparisons)
      .values({
        runId: input.runId,
        baselineCellId: input.baselineCellId,
        candidateCellId: input.candidateCellId,
        metric: input.metric,
        baselineMean: input.baselineMean,
        candidateMean: input.candidateMean,
        diff: input.diff,
        ciLower: input.ciLower,
        ciUpper: input.ciUpper,
        confidenceLevel: input.confidenceLevel ?? 0.95,
        delta: input.delta ?? 0.03,
        verdict: input.verdict,
        pValue: input.pValue ?? null,
        nPairs: input.nPairs,
        excludedPairs: input.excludedPairs ?? 0,
        reasoning: input.reasoning ?? null,
        seed: input.seed ?? null,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to insert comparison record");
    }

    return created;
  }

  async getComparisonsByRun(runId: string) {
    return this.db.query.comparisons.findMany({
      where: (c, { eq }) => eq(c.runId, runId),
      orderBy: (c, { asc }) => [asc(c.metric)],
    });
  }
}
