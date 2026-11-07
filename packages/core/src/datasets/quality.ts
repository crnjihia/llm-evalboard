import { hashCanonical } from "../hashing.js";
import type { ParsedCase } from "./parser.js";

export interface DuplicatePair {
  caseIndexA: number;
  caseIndexB: number;
  type: "exact" | "near";
  similarity: number;
  previewA: string;
  previewB: string;
}

export interface InputLengthDistribution {
  min: number;
  max: number;
  mean: number;
  median: number;
}

export interface DatasetQualityReport {
  totalCases: number;
  duplicatePairs: DuplicatePair[];
  nearDuplicatePairs: DuplicatePair[];
  labelDistribution: Record<string, number>;
  tagCoverage: Record<string, number>;
  untaggedCount: number;
  inputLengthDistribution: InputLengthDistribution;
  warnings: string[];
  isHealthy: boolean;
  summary: string;
}

function stringifyInput(input: Record<string, unknown>): string {
  if (typeof input.query === "string") return input.query;
  if (typeof input.prompt === "string") return input.prompt;
  if (typeof input.text === "string") return input.text;
  return JSON.stringify(input);
}

function generateChar3Grams(str: string): Set<string> {
  const norm = str.toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set<string>();
  for (let i = 0; i <= norm.length - 3; i++) {
    grams.add(norm.slice(i, i + 3));
  }
  return grams;
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

export interface DatasetQualityOptions {
  delta?: number; // default 0.03
  nearDuplicateThreshold?: number; // default 0.85
  minRecommendedCases?: number; // default 30
}

/**
 * Runs dataset quality checks: duplicates, near-duplicates, label distribution,
 * tag coverage, input length distribution, and sample size warnings.
 */
export function checkDatasetQuality(
  cases: ParsedCase[],
  options: DatasetQualityOptions = {},
): DatasetQualityReport {
  const delta = options.delta ?? 0.03;
  const nearDuplicateThreshold = options.nearDuplicateThreshold ?? 0.85;
  const minRecommended = options.minRecommendedCases ?? 30;

  const duplicatePairs: DuplicatePair[] = [];
  const nearDuplicatePairs: DuplicatePair[] = [];
  const warnings: string[] = [];

  // 1. Exact & Near Duplicate detection
  const inputHashes = new Map<string, number>();
  const gramsByIndex = new Map<number, Set<string>>();
  const lengths: number[] = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (!c) continue;

    const inputStr = stringifyInput(c.input);
    lengths.push(inputStr.length);
    const inputHash = hashCanonical(c.input);

    // Exact duplicate check
    const priorIndex = inputHashes.get(inputHash);
    if (priorIndex !== undefined) {
      const priorCase = cases[priorIndex];
      duplicatePairs.push({
        caseIndexA: priorIndex,
        caseIndexB: i,
        type: "exact",
        similarity: 1.0,
        previewA: priorCase ? stringifyInput(priorCase.input).slice(0, 80) : "",
        previewB: inputStr.slice(0, 80),
      });
    } else {
      inputHashes.set(inputHash, i);
    }

    gramsByIndex.set(i, generateChar3Grams(inputStr));
  }

  // Near duplicate check (for distinct inputs)
  for (let i = 0; i < cases.length; i++) {
    const gramsA = gramsByIndex.get(i);
    if (!gramsA || gramsA.size === 0) continue;

    for (let j = i + 1; j < cases.length; j++) {
      // Skip if already flagged as exact duplicate
      if (duplicatePairs.some((p) => p.caseIndexA === i && p.caseIndexB === j)) {
        continue;
      }

      const gramsB = gramsByIndex.get(j);
      if (!gramsB || gramsB.size === 0) continue;

      const sim = jaccardSimilarity(gramsA, gramsB);
      if (sim >= nearDuplicateThreshold && sim < 1.0) {
        const caseA = cases[i];
        const caseB = cases[j];
        nearDuplicatePairs.push({
          caseIndexA: i,
          caseIndexB: j,
          type: "near",
          similarity: Math.round(sim * 100) / 100,
          previewA: caseA ? stringifyInput(caseA.input).slice(0, 80) : "",
          previewB: caseB ? stringifyInput(caseB.input).slice(0, 80) : "",
        });
      }
    }
  }

  if (duplicatePairs.length > 0) {
    warnings.push(
      `Planted/unintentional exact duplicates detected: ${duplicatePairs.length} pair(s) have identical inputs.`,
    );
  }

  if (nearDuplicatePairs.length > 0) {
    warnings.push(
      `Near-duplicates detected: ${nearDuplicatePairs.length} pair(s) have similarity >= ${nearDuplicateThreshold}.`,
    );
  }

  // 2. Sample size power warning
  if (cases.length < minRecommended) {
    warnings.push(
      `Small sample size: Dataset contains ${cases.length} cases (recommended minimum >= ${minRecommended}). This will likely produce INCONCLUSIVE verdicts at effect size δ = ${delta}.`,
    );
  }

  // 3. Label distribution
  const labelDistribution: Record<string, number> = {};
  for (const c of cases) {
    if (c.expected !== undefined && c.expected !== null) {
      const labelKey =
        typeof c.expected === "object" ? JSON.stringify(c.expected) : String(c.expected);
      labelDistribution[labelKey] = (labelDistribution[labelKey] ?? 0) + 1;
    }
  }

  // 4. Tag coverage
  const tagCoverage: Record<string, number> = {};
  let untaggedCount = 0;
  for (const c of cases) {
    if (!c.tags || c.tags.length === 0) {
      untaggedCount++;
    } else {
      for (const t of c.tags) {
        tagCoverage[t] = (tagCoverage[t] ?? 0) + 1;
      }
    }
  }

  // 5. Input length distribution
  lengths.sort((a, b) => a - b);
  const min = lengths[0] ?? 0;
  const max = lengths[lengths.length - 1] ?? 0;
  const sum = lengths.reduce((acc, l) => acc + l, 0);
  const mean = lengths.length > 0 ? Math.round(sum / lengths.length) : 0;
  const mid = Math.floor(lengths.length / 2);
  const median =
    lengths.length > 0
      ? lengths.length % 2 !== 0
        ? (lengths[mid] ?? 0)
        : Math.round(((lengths[mid - 1] ?? 0) + (lengths[mid] ?? 0)) / 2)
      : 0;

  const inputLengthDistribution: InputLengthDistribution = { min, max, mean, median };

  const isHealthy = duplicatePairs.length === 0 && warnings.length === 0;
  const summary = `${cases.length} cases, ${duplicatePairs.length} exact duplicates, ${nearDuplicatePairs.length} near-duplicates, ${Object.keys(tagCoverage).length} distinct tags.`;

  return {
    totalCases: cases.length,
    duplicatePairs,
    nearDuplicatePairs,
    labelDistribution,
    tagCoverage,
    untaggedCount,
    inputLengthDistribution,
    warnings,
    isHealthy,
    summary,
  };
}
