import { mean } from "@evalboard/stats";
import type { CaseComparisonData, PerCaseDisagreement } from "./types.js";

/**
 * Extracts and sorts test cases where Baseline and Candidate disagree most.
 * Provides granular side-by-side comparison data for error analysis.
 */
export function computeTopDisagreements(
  cases: CaseComparisonData[],
  maxDisagreements = 10,
): PerCaseDisagreement[] {
  const disagreements: PerCaseDisagreement[] = [];

  for (const c of cases) {
    if (c.baselineRuns.length === 0 || c.candidateRuns.length === 0) continue;

    const baselineScore = mean(c.baselineRuns.map((r) => r.score));
    const candidateScore = mean(c.candidateRuns.map((r) => r.score));
    const absoluteDiff = Math.abs(candidateScore - baselineScore);

    // Collect outputs and grader reasons
    const baselineOutput = c.baselineRuns[0]?.output;
    const candidateOutput = c.candidateRuns[0]?.output;
    const baselineReason = c.baselineRuns
      .map((r) => r.reason)
      .filter(Boolean)
      .join(" | ");
    const candidateReason = c.candidateRuns
      .map((r) => r.reason)
      .filter(Boolean)
      .join(" | ");

    const baselineCostUsd = c.baselineRuns.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
    const candidateCostUsd = c.candidateRuns.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);

    const baselineLatencyMs = mean(c.baselineRuns.map((r) => r.latencyMs ?? 0));
    const candidateLatencyMs = mean(c.candidateRuns.map((r) => r.latencyMs ?? 0));

    disagreements.push({
      caseId: c.caseId,
      input: c.input,
      baselineScore,
      candidateScore,
      absoluteDiff,
      baselineOutput,
      candidateOutput,
      baselineReason: baselineReason || undefined,
      candidateReason: candidateReason || undefined,
      baselineCostUsd,
      candidateCostUsd,
      baselineLatencyMs,
      candidateLatencyMs,
    });
  }

  // Sort descending by absolute score difference
  disagreements.sort((a, b) => b.absoluteDiff - a.absoluteDiff);

  return disagreements.slice(0, maxDisagreements);
}
