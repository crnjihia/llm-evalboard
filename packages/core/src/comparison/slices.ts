import { evaluateVerdict, mean } from "@evalboard/stats";
import type { CaseComparisonData, ComparisonOptions, SliceResult } from "./types.js";

/**
 * Determines the input length bucket based on JSON character length.
 */
function getInputLengthBucket(input: Record<string, unknown>): "short" | "medium" | "long" {
  const jsonStr = JSON.stringify(input);
  const len = jsonStr.length;
  if (len < 100) return "short";
  if (len <= 500) return "medium";
  return "long";
}

/**
 * Groups cases into slices by tags, category, input length bucket, and custom metadata keys.
 * Evaluates each slice independently with confidence intervals and Simpson's-paradox anomaly detection.
 */
export function analyzeSlices(
  cases: CaseComparisonData[],
  overallDiff: number,
  options?: ComparisonOptions,
): { slices: SliceResult[]; simpsonsAnomalies: SliceResult[] } {
  const minSliceSize = options?.minSliceSize ?? 10;
  const delta = options?.delta ?? 0.03;
  const seed = options?.seed ?? 42;

  // Extract slices map: Map<"key:value", CaseComparisonData[]>
  const sliceGroups = new Map<
    string,
    { key: string; value: string; cases: CaseComparisonData[] }
  >();

  function addCaseToSlice(key: string, value: string, c: CaseComparisonData) {
    const sliceId = `${key}:::${value}`;
    let group = sliceGroups.get(sliceId);
    if (!group) {
      group = { key, value, cases: [] };
      sliceGroups.set(sliceId, group);
    }
    group.cases.push(c);
  }

  for (const c of cases) {
    // 1. Tags
    if (c.tags && c.tags.length > 0) {
      for (const tag of c.tags) {
        addCaseToSlice("tag", tag, c);
      }
    }

    // 2. Category
    if (c.metadata && typeof c.metadata.category === "string") {
      addCaseToSlice("category", c.metadata.category, c);
    }

    // 3. Input length bucket
    const bucket = getInputLengthBucket(c.input);
    addCaseToSlice("input_length", bucket, c);

    // 4. Other metadata keys (strings or booleans)
    if (c.metadata) {
      for (const [metaKey, metaVal] of Object.entries(c.metadata)) {
        if (metaKey === "category") continue;
        if (
          typeof metaVal === "string" ||
          typeof metaVal === "number" ||
          typeof metaVal === "boolean"
        ) {
          addCaseToSlice(metaKey, String(metaVal), c);
        }
      }
    }
  }

  const slices: SliceResult[] = [];
  const simpsonsAnomalies: SliceResult[] = [];

  for (const group of sliceGroups.values()) {
    const n = group.cases.length;
    const isSmallSample = n < minSliceSize;
    const warning = isSmallSample
      ? `n too small (n = ${n} < ${minSliceSize}); do not draw firm conclusions`
      : undefined;

    // Per unit of analysis rule: average repeats for each case
    const baselineCaseMeans = group.cases.map((c) => mean(c.baselineRuns.map((r) => r.score)));
    const candidateCaseMeans = group.cases.map((c) => mean(c.candidateRuns.map((r) => r.score)));

    const verdictResult = evaluateVerdict(baselineCaseMeans, candidateCaseMeans, {
      delta,
      confidence: options?.confidence ?? 0.95,
      seed,
    });

    const baselineMean = mean(baselineCaseMeans);
    const candidateMean = mean(candidateCaseMeans);
    const diff = verdictResult.d;

    // Simpson's Paradox Guard:
    // Check if the slice direction explicitly opposes the overall direction
    let isSimpsonsAnomaly = false;
    let simpsonsReasoning: string | undefined;

    // If overall is positive, but this slice has a negative diff (and either non-trivial drop or conclusive degradation)
    if (overallDiff > 0 && diff < -0.005) {
      const isReversal = verdictResult.verdict === "WORSE" || (!isSmallSample && diff <= -delta);
      if (isReversal) {
        isSimpsonsAnomaly = true;
        simpsonsReasoning = `Simpson's paradox detected: Overall performance improved (+${overallDiff.toFixed(4)}), but in slice '${group.key}=${group.value}', candidate significantly regressed (${diff.toFixed(4)}, CI [${verdictResult.ci.lower.toFixed(4)}, ${verdictResult.ci.upper.toFixed(4)}]).`;
      }
    } else if (overallDiff < 0 && diff > 0.005) {
      const isReversal = verdictResult.verdict === "BETTER" || (!isSmallSample && diff >= delta);
      if (isReversal) {
        isSimpsonsAnomaly = true;
        simpsonsReasoning = `Simpson's paradox detected: Overall performance degraded (${overallDiff.toFixed(4)}), but in slice '${group.key}=${group.value}', candidate improved (+${diff.toFixed(4)}, CI [${verdictResult.ci.lower.toFixed(4)}, ${verdictResult.ci.upper.toFixed(4)}]).`;
      }
    }

    const sliceResult: SliceResult = {
      sliceKey: group.key,
      sliceValue: group.value,
      sampleSize: n,
      isSmallSample,
      warning,
      baselineMean,
      candidateMean,
      diff,
      ci: verdictResult.ci,
      verdict: verdictResult.verdict,
      isSimpsonsAnomaly,
      simpsonsReasoning,
    };

    slices.push(sliceResult);
    if (isSimpsonsAnomaly) {
      simpsonsAnomalies.push(sliceResult);
    }
  }

  // Sort slices: anomalies first, then by sample size descending
  slices.sort((a, b) => {
    if (a.isSimpsonsAnomaly && !b.isSimpsonsAnomaly) return -1;
    if (!a.isSimpsonsAnomaly && b.isSimpsonsAnomaly) return 1;
    return b.sampleSize - a.sampleSize;
  });

  return { slices, simpsonsAnomalies };
}
