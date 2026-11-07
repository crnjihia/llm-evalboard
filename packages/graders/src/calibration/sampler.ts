import { SeededPRNG } from "@evalboard/stats";

export interface JudgedSampleItem {
  caseResultId: string;
  caseId: string;
  criterion: string;
  input: Record<string, unknown>;
  expected?: unknown;
  output: string;
  judgeScore: number;
  model: string;
  tags?: string[];
}

export interface BlindedHumanLabelTask {
  caseResultId: string;
  caseId: string;
  criterion: string;
  input: Record<string, unknown>;
  expected?: unknown;
  output: string;
  modelArm: string; // obfuscated arm or model name
  tags?: string[];
  // NOTE: judgeScore is DELIBERATELY EXCLUDED to preserve blind human labelling!
}

export interface StratifiedSamplingOptions {
  sampleSize: number;
  seed?: number | string;
}

/**
 * Performs stratified sampling of judged items by score stratum and arm,
 * blinding human labelers to the judge's score.
 */
export function sampleJudgedItemsForCalibration(
  items: JudgedSampleItem[],
  options: StratifiedSamplingOptions,
): BlindedHumanLabelTask[] {
  if (items.length <= options.sampleSize) {
    // Return all items blinded
    return items.map(blindItem);
  }

  const prng = new SeededPRNG(options.seed ?? 42);

  // Partition into 3 strata: Low (< 0.35), Med (0.35 - 0.70), High (> 0.70)
  const lowStrata: JudgedSampleItem[] = [];
  const medStrata: JudgedSampleItem[] = [];
  const highStrata: JudgedSampleItem[] = [];

  for (const item of items) {
    if (item.judgeScore < 0.35) {
      lowStrata.push(item);
    } else if (item.judgeScore <= 0.7) {
      medStrata.push(item);
    } else {
      highStrata.push(item);
    }
  }

  const strata = [lowStrata, medStrata, highStrata].filter((s) => s.length > 0);
  const targetPerStratum = Math.ceil(options.sampleSize / strata.length);

  const sampledItems: JudgedSampleItem[] = [];

  for (const group of strata) {
    const countToTake = Math.min(group.length, targetPerStratum);
    // Shuffle group deterministically using PRNG
    const shuffled = [...group].sort(() => prng.next() - 0.5);
    sampledItems.push(...shuffled.slice(0, countToTake));
  }

  // Shuffle final list and trim to exact sampleSize
  const finalShuffled = [...sampledItems]
    .sort(() => prng.next() - 0.5)
    .slice(0, options.sampleSize);

  return finalShuffled.map(blindItem);
}

function blindItem(item: JudgedSampleItem): BlindedHumanLabelTask {
  return {
    caseResultId: item.caseResultId,
    caseId: item.caseId,
    criterion: item.criterion,
    input: item.input,
    expected: item.expected,
    output: item.output,
    modelArm: item.model,
    tags: item.tags,
  };
}
