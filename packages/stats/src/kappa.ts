import { SeededPRNG } from "./prng.js";

export type KappaWeightType = "unweighted" | "linear" | "quadratic";

export interface CohenKappaOptions<T = string | number> {
  categories?: T[];
  weights?: KappaWeightType;
}

export interface CohenKappaResult<T = string | number> {
  kappa: number;
  rawAgreement: number;
  expectedAgreement: number;
  categories: T[];
  confusionMatrix: number[][];
  sampleSize: number;
}

/**
 * Computes the confusion matrix between human and judge ratings.
 */
export function computeConfusionMatrix<T = string | number>(
  human: readonly T[],
  judge: readonly T[],
  categories: readonly T[],
): number[][] {
  const k = categories.length;
  const catIndex = new Map<T, number>();
  for (let i = 0; i < k; i++) {
    catIndex.set(categories[i] as T, i);
  }

  const matrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const n = Math.min(human.length, judge.length);

  for (let i = 0; i < n; i++) {
    const h = human[i];
    const j = judge[i];
    if (h !== undefined && j !== undefined) {
      const row = catIndex.get(h);
      const col = catIndex.get(j);
      if (row !== undefined && col !== undefined) {
        const r = matrix[row];
        if (r && r[col] !== undefined) {
          r[col]++;
        }
      }
    }
  }

  return matrix;
}

/**
 * Computes raw observed agreement (proportion of identical ratings).
 */
export function computeRawAgreement<T = string | number>(
  human: readonly T[],
  judge: readonly T[],
): number {
  if (human.length === 0 || judge.length === 0) return 0;
  const n = Math.min(human.length, judge.length);
  let matches = 0;
  for (let i = 0; i < n; i++) {
    if (human[i] === judge[i]) {
      matches++;
    }
  }
  return matches / n;
}

/**
 * Computes Cohen's Kappa (unweighted, linear, or quadratic weighted)
 * matching scikit-learn and standard statistical reference specifications.
 */
export function computeCohenKappa<T = string | number>(
  human: readonly T[],
  judge: readonly T[],
  options?: CohenKappaOptions<T>,
): CohenKappaResult<T> {
  const n = Math.min(human.length, judge.length);
  if (n === 0) {
    return {
      kappa: 0,
      rawAgreement: 0,
      expectedAgreement: 0,
      categories: [],
      confusionMatrix: [],
      sampleSize: 0,
    };
  }

  // Derive categories if not supplied
  const categories: T[] = options?.categories
    ? [...options.categories]
    : (Array.from(new Set([...human, ...judge])).sort() as T[]);

  const k = categories.length;
  if (k <= 1) {
    return {
      kappa: 1,
      rawAgreement: 1,
      expectedAgreement: 1,
      categories,
      confusionMatrix: [[n]],
      sampleSize: n,
    };
  }

  const weights = options?.weights ?? "unweighted";
  const matrix = computeConfusionMatrix(human, judge, categories);

  const rowSums: number[] = new Array(k).fill(0);
  const colSums: number[] = new Array(k).fill(0);

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const val = matrix[i]?.[j] ?? 0;
      rowSums[i] = (rowSums[i] ?? 0) + val;
      colSums[j] = (colSums[j] ?? 0) + val;
    }
  }

  let po = 0.0;
  let pe = 0.0;

  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let w = 0.0;
      if (weights === "unweighted") {
        w = i === j ? 1.0 : 0.0;
      } else if (weights === "linear") {
        w = 1.0 - Math.abs(i - j) / (k - 1);
      } else if (weights === "quadratic") {
        w = 1.0 - (i - j) ** 2 / (k - 1) ** 2;
      }

      const cellVal = matrix[i]?.[j] ?? 0;
      const rSum = rowSums[i] ?? 0;
      const cSum = colSums[j] ?? 0;

      po += w * (cellVal / n);
      pe += w * ((rSum * cSum) / (n * n));
    }
  }

  let kappa: number;
  if (Math.abs(1.0 - pe) < 1e-12) {
    kappa = Math.abs(po - 1.0) < 1e-12 ? 1.0 : 0.0;
  } else {
    kappa = (po - pe) / (1.0 - pe);
  }

  return {
    kappa: Math.round(kappa * 1000000) / 1000000,
    rawAgreement: Math.round(computeRawAgreement(human, judge) * 1000000) / 1000000,
    expectedAgreement: Math.round(pe * 1000000) / 1000000,
    categories,
    confusionMatrix: matrix,
    sampleSize: n,
  };
}

export interface BootstrapKappaCIOptions<T = string | number> extends CohenKappaOptions<T> {
  numResamples?: number;
  confidenceLevel?: number; // e.g. 0.95
  seed?: number | string;
}

export interface BootstrapCI {
  estimate: number;
  lower: number;
  upper: number;
  confidenceLevel: number;
  numResamples: number;
}

/**
 * Computes a bootstrap confidence interval for Cohen's Kappa using seeded PRNG.
 */
export function bootstrapKappaCI<T = string | number>(
  human: readonly T[],
  judge: readonly T[],
  options?: BootstrapKappaCIOptions<T>,
): BootstrapCI {
  const n = Math.min(human.length, judge.length);
  const pointEstimate = computeCohenKappa(human, judge, options).kappa;

  if (n < 2) {
    return {
      estimate: pointEstimate,
      lower: pointEstimate,
      upper: pointEstimate,
      confidenceLevel: options?.confidenceLevel ?? 0.95,
      numResamples: 0,
    };
  }

  const numResamples = options?.numResamples ?? 1000;
  const confidenceLevel = options?.confidenceLevel ?? 0.95;
  const prng = new SeededPRNG(options?.seed ?? 42);

  const resampleKappas: number[] = new Array(numResamples);
  const indices = Array.from({ length: n }, (_, i) => i);

  for (let b = 0; b < numResamples; b++) {
    const sampledIndices = prng.sampleWithReplacement(indices, n);
    const sampledHuman = sampledIndices
      .map((idx) => human[idx])
      .filter((v): v is T => v !== undefined);
    const sampledJudge = sampledIndices
      .map((idx) => judge[idx])
      .filter((v): v is T => v !== undefined);
    resampleKappas[b] = computeCohenKappa(sampledHuman, sampledJudge, options).kappa;
  }

  resampleKappas.sort((a, b) => a - b);

  const alpha = 1.0 - confidenceLevel;
  const lowerIdx = Math.max(0, Math.floor((alpha / 2) * numResamples));
  const upperIdx = Math.min(numResamples - 1, Math.floor((1.0 - alpha / 2) * numResamples));

  const lower = resampleKappas[lowerIdx] ?? pointEstimate;
  const upper = resampleKappas[upperIdx] ?? pointEstimate;

  return {
    estimate: pointEstimate,
    lower: Math.round(lower * 10000) / 10000,
    upper: Math.round(upper * 10000) / 10000,
    confidenceLevel,
    numResamples,
  };
}

export interface LengthBiasReport {
  correlation: number;
  isBiased: boolean;
  sampleSize: number;
  explanation: string;
}

/**
 * Checks for length bias by computing Pearson correlation between output length
 * and judge score, evaluating whether the judge systematically favors longer outputs.
 */
export function computeLengthBias(
  outputLengths: readonly number[],
  judgeScores: readonly number[],
  threshold = 0.35,
): LengthBiasReport {
  const n = Math.min(outputLengths.length, judgeScores.length);
  if (n < 5) {
    return {
      correlation: 0,
      isBiased: false,
      sampleSize: n,
      explanation: "Sample size too small to evaluate length bias reliably (need at least 5)",
    };
  }

  const x = outputLengths.slice(0, n);
  const y = judgeScores.slice(0, n);

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i] ?? meanX;
    const yi = y[i] ?? meanY;
    const dx = xi - meanX;
    const dy = yi - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  const correlation = den === 0 ? 0 : Math.round((num / den) * 10000) / 10000;
  const isBiased = Math.abs(correlation) >= threshold;

  const explanation = isBiased
    ? `Length bias detected: correlation between output length and judge score is r=${correlation.toFixed(2)} (>= threshold ${threshold}). Judge favors ${correlation > 0 ? "longer" : "shorter"} outputs.`
    : `No meaningful length bias: correlation is r=${correlation.toFixed(2)} (< threshold ${threshold}).`;

  return {
    correlation,
    isBiased,
    sampleSize: n,
    explanation,
  };
}
