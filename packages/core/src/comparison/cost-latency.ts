import { mean, quantile } from "@evalboard/stats";
import type { CaseComparisonData, CellResourceUsage } from "./types.js";

/**
 * Aggregates generation cost, judge cost, token usage, and latency distribution
 * for an arm/cell. The cost of judges is strictly reported separately from the candidate's cost.
 */
export function aggregateCellResourceUsage(
  cellId: string,
  cellName: string,
  cases: CaseComparisonData[],
  side: "baseline" | "candidate",
): CellResourceUsage {
  let generationCostUsd = 0;
  let judgeCostUsd = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;
  const latencies: number[] = [];

  for (const c of cases) {
    const runs = side === "baseline" ? c.baselineRuns : c.candidateRuns;
    for (const r of runs) {
      generationCostUsd += r.costUsd ?? 0;
      judgeCostUsd += r.judgeCostUsd ?? 0;
      if (r.tokens) {
        promptTokens += r.tokens.prompt;
        completionTokens += r.tokens.completion;
        totalTokens += r.tokens.total;
      }
      if (r.latencyMs !== undefined && r.latencyMs >= 0) {
        latencies.push(r.latencyMs);
      }
    }
  }

  const totalCostUsd = generationCostUsd + judgeCostUsd;
  const nCases = Math.max(1, cases.length);
  const costPer1kCasesUsd = (totalCostUsd / nCases) * 1000;

  const latencyMeanMs = latencies.length > 0 ? mean(latencies) : 0;
  const latencyP50Ms = latencies.length > 0 ? quantile(latencies, 0.5) : 0;
  const latencyP95Ms = latencies.length > 0 ? quantile(latencies, 0.95) : 0;

  return {
    cellId,
    cellName,
    generationCostUsd,
    judgeCostUsd,
    totalCostUsd,
    costPer1kCasesUsd,
    latencyMeanMs,
    latencyP50Ms,
    latencyP95Ms,
    tokens: {
      prompt: promptTokens,
      completion: completionTokens,
      total: totalTokens,
    },
  };
}
