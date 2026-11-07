import {
  type BootstrapOptions,
  type ConfidenceIntervalResult,
  bootstrapConfidenceInterval,
  mean,
  normalPpf,
  standardDeviation,
} from "./descriptives.js";

/**
 * Wilson score confidence interval for a single proportion (e.g. Pass rate, Attack Success Rate).
 * Provides robust coverage even for small samples or near-boundary probabilities (0 or 1).
 */
export function wilsonScoreInterval(
  successes: number,
  total: number,
  confidence = 0.95,
): ConfidenceIntervalResult {
  if (total <= 0) {
    return {
      pointEstimate: 0,
      lower: 0,
      upper: 0,
      confidence,
    };
  }

  const p = Math.max(0, Math.min(1, successes / total));
  const alpha = 1.0 - confidence;
  const z = normalPpf(1.0 - alpha / 2.0);
  const z2 = z * z;

  const denom = 1.0 + z2 / total;
  const center = (p + z2 / (2.0 * total)) / denom;
  const spread = (z * Math.sqrt((p * (1.0 - p) + z2 / (4.0 * total)) / total)) / denom;

  const lower = Math.max(0.0, center - spread);
  const upper = Math.min(1.0, center + spread);

  return {
    pointEstimate: p,
    lower,
    upper,
    confidence,
  };
}

/**
 * Computes combinations n choose k: C(n, k).
 */
function combinations(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  const c = Math.min(k, n - k);
  let res = 1;
  for (let i = 1; i <= c; i++) {
    res = (res * (n - (c - i))) / i;
  }
  return res;
}

export interface McNemarResult {
  b: number; // Baseline pass, Candidate fail
  c: number; // Baseline fail, Candidate pass
  discordantTotal: number;
  pValue: number;
}

/**
 * McNemar's exact two-sided test for paired binary outcomes.
 * Uses exact Binomial(n, 0.5) distribution without large-sample chi-square continuity approximations.
 *
 * @param b Count of discordant pairs where Baseline passed and Candidate failed.
 * @param c Count of discordant pairs where Baseline failed and Candidate passed.
 */
export function mcnemarExactTest(b: number, c: number): McNemarResult {
  const n = b + c;
  if (n === 0) {
    return { b, c, discordantTotal: 0, pValue: 1.0 };
  }

  const k = Math.min(b, c);
  let cumulative = 0;
  for (let i = 0; i <= k; i++) {
    cumulative += combinations(n, i) * 0.5 ** n;
  }

  const pValue = Math.min(1.0, 2.0 * cumulative);
  return {
    b,
    c,
    discordantTotal: n,
    pValue,
  };
}

export interface PairedDifferenceResult {
  nPairs: number;
  meanDifference: number;
  stdDifference: number;
  cohensDz: number;
  ci: ConfidenceIntervalResult;
  differences: number[];
}

/**
 * Analyzes paired differences between Candidate and Baseline: (Candidate - Baseline).
 * Calculates point estimate, Cohen's dz effect size, and percentile bootstrap confidence interval.
 */
export function analyzePairedDifferences(
  baselineScores: number[],
  candidateScores: number[],
  options?: BootstrapOptions,
): PairedDifferenceResult {
  const n = Math.min(baselineScores.length, candidateScores.length);
  if (n === 0) {
    return {
      nPairs: 0,
      meanDifference: 0,
      stdDifference: 0,
      cohensDz: 0,
      ci: { lower: 0, upper: 0, pointEstimate: 0, confidence: options?.confidence ?? 0.95 },
      differences: [],
    };
  }

  const differences: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    differences[i] = (candidateScores[i] ?? 0) - (baselineScores[i] ?? 0);
  }

  const meanDiff = mean(differences);
  const stdDiff = standardDeviation(differences, 1);
  const cohensDz = stdDiff > 0 ? meanDiff / stdDiff : 0;

  const ci = bootstrapConfidenceInterval(differences, options);

  return {
    nPairs: n,
    meanDifference: meanDiff,
    stdDifference: stdDiff,
    cohensDz,
    ci,
    differences,
  };
}
