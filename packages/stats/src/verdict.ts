import type { BootstrapOptions, ConfidenceIntervalResult } from "./descriptives.js";
import { analyzePairedDifferences } from "./paired.js";
import { estimateAdditionalCasesNeeded } from "./power.js";

export type ComparisonVerdict = "BETTER" | "WORSE" | "NO MEANINGFUL DIFFERENCE" | "INCONCLUSIVE";

export interface VerdictResult {
  verdict: ComparisonVerdict;
  d: number; // Point estimate of mean paired difference (Candidate - Baseline)
  ci: ConfidenceIntervalResult;
  delta: number; // Smallest effect of interest (default 0.03)
  nPairs: number;
  excludedPairs: number;
  reasoning: string;
  estimatedAdditionalCases?: number;
}

export interface VerdictOptions extends BootstrapOptions {
  delta?: number; // Smallest effect of interest (default 0.03)
}

/**
 * Evaluates the 4-way statistical verdict between Candidate and Baseline:
 *
 * 1. BETTER: L > 0 and d >= delta
 * 2. WORSE: U < 0 and d <= -delta
 * 3. NO MEANINGFUL DIFFERENCE: L > -delta and U < delta (whole CI lies strictly within [-delta, +delta])
 * 4. INCONCLUSIVE: anything else (interval too wide or ambiguous); estimates additional cases required.
 */
export function determineVerdict(
  ci: ConfidenceIntervalResult,
  d: number,
  delta = 0.03,
  nPairs = 0,
  stdDiff = 0,
): { verdict: ComparisonVerdict; reasoning: string; estimatedAdditionalCases?: number } {
  const { lower: L, upper: U, confidence } = ci;
  const pct = Math.round(confidence * 100);

  if (L > 0 && d >= delta) {
    return {
      verdict: "BETTER",
      reasoning: `Candidate reliably outperforms baseline: difference d = ${d >= 0 ? "+" : ""}${d.toFixed(4)} meets or exceeds delta (${delta}), and ${pct}% CI [${L.toFixed(4)}, ${U.toFixed(4)}] is strictly above 0.`,
    };
  }

  if (U < 0 && d <= -delta) {
    return {
      verdict: "WORSE",
      reasoning: `Candidate reliably degrades performance: difference d = ${d.toFixed(4)} meets or exceeds -delta (-${delta}), and ${pct}% CI [${L.toFixed(4)}, ${U.toFixed(4)}] is strictly below 0.`,
    };
  }

  if (L > -delta && U < delta) {
    return {
      verdict: "NO MEANINGFUL DIFFERENCE",
      reasoning: `Candidate and baseline are practically equivalent: difference d = ${d >= 0 ? "+" : ""}${d.toFixed(4)}, and entire ${pct}% CI [${L.toFixed(4)}, ${U.toFixed(4)}] is contained within the [+-${delta}] zone of indifference.`,
    };
  }

  const additionalCases = estimateAdditionalCasesNeeded(nPairs, stdDiff, delta, {
    alpha: 1.0 - confidence,
    power: 0.8,
  });

  return {
    verdict: "INCONCLUSIVE",
    reasoning: `Evidence is insufficient to distinguish effect from noise: difference d = ${d >= 0 ? "+" : ""}${d.toFixed(4)} with ${pct}% CI [${L.toFixed(4)}, ${U.toFixed(4)}] spans across the decision boundary. Estimated ${additionalCases} additional test cases needed to achieve 80% power at delta = ${delta}.`,
    estimatedAdditionalCases: additionalCases,
  };
}

/**
 * Computes paired differences, bootstrap CI, and returns the 4-way statistical verdict.
 */
export function evaluateVerdict(
  baselineScores: number[],
  candidateScores: number[],
  options?: VerdictOptions,
): VerdictResult {
  const delta = options?.delta ?? 0.03;
  const totalLength = Math.max(baselineScores.length, candidateScores.length);
  const nPairs = Math.min(baselineScores.length, candidateScores.length);
  const excludedPairs = totalLength - nPairs;

  const paired = analyzePairedDifferences(
    baselineScores.slice(0, nPairs),
    candidateScores.slice(0, nPairs),
    options,
  );

  const { verdict, reasoning, estimatedAdditionalCases } = determineVerdict(
    paired.ci,
    paired.meanDifference,
    delta,
    paired.nPairs,
    paired.stdDifference,
  );

  return {
    verdict,
    d: paired.meanDifference,
    ci: paired.ci,
    delta,
    nPairs: paired.nPairs,
    excludedPairs,
    reasoning,
    estimatedAdditionalCases,
  };
}
