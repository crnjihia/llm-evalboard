import { createPrng } from "./prng.js";

/**
 * Inverse standard normal cumulative distribution function (Acklam's algorithm).
 * Accurate to > 9 decimal places across the entire domain (0, 1).
 */
export function normalPpf(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new RangeError(`p must be strictly between 0 and 1, got ${p}`);
  }

  const a0 = -3.969683028665376e1;
  const a1 = 2.209460984245205e2;
  const a2 = -2.759285104469687e2;
  const a3 = 1.38357751867269e2;
  const a4 = -3.066479806614716e1;
  const a5 = 2.506628277459239;

  const b0 = -5.447609879822406e1;
  const b1 = 1.615858368580409e2;
  const b2 = -1.556989798598866e2;
  const b3 = 6.680131188771972e1;
  const b4 = -1.328068155288572e1;

  const c0 = -7.784894002430293e-3;
  const c1 = -3.223964580411365e-1;
  const c2 = -2.400758277161838;
  const c3 = -2.549732539343734;
  const c4 = 4.374664141464968;
  const c5 = 2.938163982698783;

  const d0 = 7.784695709041462e-3;
  const d1 = 3.224671290700398e-1;
  const d2 = 2.445134137142996;
  const d3 = 3.754408661907416;

  const pLow = 0.02425;
  const pHigh = 1.0 - pLow;

  if (p < pLow) {
    const q = Math.sqrt(-2.0 * Math.log(p));
    return (
      (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
      ((((d0 * q + d1) * q + d2) * q + d3) * q + 1.0)
    );
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      (q * (((((a0 * r + a1) * r + a2) * r + a3) * r + a4) * r + a5)) /
      (((((b0 * r + b1) * r + b2) * r + b3) * r + b4) * r + 1.0)
    );
  }
  const q = Math.sqrt(-2.0 * Math.log(1.0 - p));
  return -(
    (((((c0 * q + c1) * q + c2) * q + c3) * q + c4) * q + c5) /
    ((((d0 * q + d1) * q + d2) * q + d3) * q + 1.0)
  );
}

/**
 * Standard arithmetic mean of a numeric sequence.
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, val) => acc + val, 0);
  return sum / values.length;
}

/**
 * Sample or population variance.
 * @param ddof Degrees of freedom adjustment (default 1 for sample variance).
 */
export function variance(values: number[], ddof = 1): number {
  if (values.length <= ddof) return 0;
  const m = mean(values);
  const sumSq = values.reduce((acc, val) => acc + (val - m) ** 2, 0);
  return sumSq / (values.length - ddof);
}

/**
 * Standard deviation.
 */
export function standardDeviation(values: number[], ddof = 1): number {
  return Math.sqrt(variance(values, ddof));
}

/**
 * Standard error of the mean (SE = s / sqrt(n)).
 */
export function standardError(values: number[]): number {
  if (values.length <= 1) return 0;
  return standardDeviation(values, 1) / Math.sqrt(values.length);
}

/**
 * Quantile calculation using linear interpolation (type 7).
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  if (q <= 0) return Math.min(...values);
  if (q >= 1) return Math.max(...values);

  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  const low = sorted[base] ?? 0;
  const high = sorted[base + 1] ?? low;
  return low + rest * (high - low);
}

/**
 * Median of values.
 */
export function median(values: number[]): number {
  return quantile(values, 0.5);
}

/**
 * Interquartile Range (IQR = Q3 - Q1).
 */
export function interquartileRange(values: number[]): number {
  if (values.length < 2) return 0;
  return quantile(values, 0.75) - quantile(values, 0.25);
}

export interface ConfidenceIntervalResult {
  pointEstimate: number;
  lower: number;
  upper: number;
  confidence: number;
}

export interface BootstrapOptions {
  confidence?: number;
  resamples?: number;
  seed?: number;
}

/**
 * Percentile bootstrap confidence interval for the mean.
 */
export function bootstrapConfidenceInterval(
  sample: number[],
  options?: BootstrapOptions,
): ConfidenceIntervalResult {
  const n = sample.length;
  if (n === 0) {
    return { pointEstimate: 0, lower: 0, upper: 0, confidence: options?.confidence ?? 0.95 };
  }

  const pointEstimate = mean(sample);
  if (n === 1) {
    return {
      pointEstimate,
      lower: pointEstimate,
      upper: pointEstimate,
      confidence: options?.confidence ?? 0.95,
    };
  }

  const confidence = options?.confidence ?? 0.95;
  const resamples = options?.resamples ?? 2000;
  const prng = createPrng(options?.seed ?? 42);

  const bootstrapMeans: number[] = new Array(resamples);

  for (let b = 0; b < resamples; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(prng() * n);
      sum += sample[idx] ?? 0;
    }
    bootstrapMeans[b] = sum / n;
  }

  bootstrapMeans.sort((a, b) => a - b);
  const alpha = 1.0 - confidence;
  const lowerIdx = Math.floor((alpha / 2.0) * resamples);
  const upperIdx = Math.min(resamples - 1, Math.floor((1.0 - alpha / 2.0) * resamples));

  return {
    pointEstimate,
    lower: bootstrapMeans[lowerIdx] ?? pointEstimate,
    upper: bootstrapMeans[upperIdx] ?? pointEstimate,
    confidence,
  };
}

/**
 * Cluster bootstrap confidence interval over cases (averaging repeats first).
 * In an LLM evaluation, each case is a cluster of 1 or more repeats.
 * Resampling is performed over the cases, not over individual repeats, preserving the unit of analysis.
 */
export function clusterBootstrapMean(
  clusters: number[][],
  options?: BootstrapOptions,
): ConfidenceIntervalResult {
  // Collapse each cluster (case) to its mean first
  const caseMeans = clusters
    .filter((repeats) => repeats.length > 0)
    .map((repeats) => mean(repeats));

  return bootstrapConfidenceInterval(caseMeans, options);
}
