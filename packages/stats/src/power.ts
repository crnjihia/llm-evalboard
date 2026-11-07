import { normalPpf } from "./descriptives.js";

export interface PowerEstimationOptions {
  alpha?: number; // Significance level, default 0.05
  power?: number; // Target statistical power (1 - beta), default 0.80
}

/**
 * Calculates the required sample size (number of evaluation cases) to detect a
 * smallest effect of interest (delta) with specified statistical power in a paired design.
 *
 * Formula: N = ceil( (z_{1 - alpha/2} + z_{power})^2 * sigma_D^2 / delta^2 )
 *
 * @param stdDiff Standard deviation of the paired differences (Candidate - Baseline)
 * @param delta Smallest effect of interest (minimum detectable difference)
 * @param options Alpha (default 0.05) and Power (default 0.80)
 */
export function estimateRequiredSampleSize(
  stdDiff: number,
  delta: number,
  options?: PowerEstimationOptions,
): number {
  if (delta <= 0 || stdDiff <= 0) {
    return 1;
  }

  const alpha = options?.alpha ?? 0.05;
  const power = options?.power ?? 0.8;

  const zAlpha = normalPpf(1.0 - alpha / 2.0);
  const zBeta = normalPpf(power);

  const n = ((zAlpha + zBeta) ** 2 * stdDiff ** 2) / delta ** 2;
  return Math.max(1, Math.ceil(n));
}

/**
 * Estimates additional test cases needed to resolve an INCONCLUSIVE comparison.
 */
export function estimateAdditionalCasesNeeded(
  currentN: number,
  stdDiff: number,
  delta: number,
  options?: PowerEstimationOptions,
): number {
  const nRequired = estimateRequiredSampleSize(stdDiff, delta, options);
  return Math.max(0, nRequired - currentN);
}
