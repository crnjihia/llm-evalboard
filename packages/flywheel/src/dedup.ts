import type { DedupCluster } from "./types.js";

/**
 * Tokenize a string into cleaned word tokens
 */
export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

/**
 * Extract word n-grams from a token sequence (unigrams and n-grams up to n)
 */
export function extractWordNGrams(tokens: string[], n = 2): Set<string> {
  const ngrams = new Set<string>();
  if (tokens.length === 0) return ngrams;

  // Include unigrams
  for (const t of tokens) {
    ngrams.add(t);
  }

  // Include higher-order n-grams up to n
  for (let order = 2; order <= n; order++) {
    if (tokens.length >= order) {
      for (let i = 0; i <= tokens.length - order; i++) {
        ngrams.add(tokens.slice(i, i + order).join(" "));
      }
    }
  }

  return ngrams;
}

/**
 * Compute Jaccard similarity between two sets of n-grams: |A ∩ B| / |A ∪ B|
 */
export function computeJaccardSimilarity(textA: string, textB: string, n = 2): number {
  if (textA.trim() === textB.trim()) return 1.0;
  if (!textA.trim() || !textB.trim()) return 0.0;

  const tokensA = tokenizeWords(textA);
  const tokensB = tokenizeWords(textB);

  const ngramsA = extractWordNGrams(tokensA, n);
  const ngramsB = extractWordNGrams(tokensB, n);

  if (ngramsA.size === 0 && ngramsB.size === 0) return 1.0;
  if (ngramsA.size === 0 || ngramsB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const item of ngramsA) {
    if (ngramsB.has(item)) {
      intersectionCount++;
    }
  }

  const unionCount = ngramsA.size + ngramsB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  maxSimilarity: number;
  matchedText?: string;
  matchedIndex?: number;
}

/**
 * Checks if a candidate text is a near-duplicate of any item in an existing collection
 */
export function isDuplicate(
  candidate: string,
  existingCollection: string[],
  threshold = 0.85,
  n = 2,
): DuplicateCheckResult {
  let maxSimilarity = 0;
  let matchedText: string | undefined;
  let matchedIndex: number | undefined;

  for (let i = 0; i < existingCollection.length; i++) {
    const existing = existingCollection[i];
    if (!existing) continue;

    const sim = computeJaccardSimilarity(candidate, existing, n);
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      matchedText = existing;
      matchedIndex = i;
    }
    if (sim >= threshold) {
      return {
        isDuplicate: true,
        maxSimilarity: sim,
        matchedText: existing,
        matchedIndex: i,
      };
    }
  }

  return {
    isDuplicate: maxSimilarity >= threshold,
    maxSimilarity,
    matchedText,
    matchedIndex,
  };
}

export interface ClusterableItem {
  id: string;
  text: string;
}

/**
 * Greedy clustering of traces based on Jaccard similarity threshold
 */
export function clusterTraces<T extends ClusterableItem>(
  items: T[],
  threshold = 0.85,
  n = 2,
): DedupCluster[] {
  const clusters: {
    clusterId: string;
    representativeId: string;
    representativeText: string;
    memberIds: string[];
  }[] = [];

  for (const item of items) {
    let bestClusterIndex = -1;
    let highestSim = 0;

    for (let c = 0; c < clusters.length; c++) {
      const cluster = clusters[c];
      if (!cluster) continue;

      const sim = computeJaccardSimilarity(item.text, cluster.representativeText, n);
      if (sim > highestSim) {
        highestSim = sim;
        bestClusterIndex = c;
      }
    }

    if (bestClusterIndex >= 0 && highestSim >= threshold) {
      clusters[bestClusterIndex]?.memberIds.push(item.id);
    } else {
      clusters.push({
        clusterId: `cluster-${clusters.length + 1}`,
        representativeId: item.id,
        representativeText: item.text,
        memberIds: [item.id],
      });
    }
  }

  return clusters.map((c) => ({
    clusterId: c.clusterId,
    representativeTraceId: c.representativeId,
    traceIds: c.memberIds,
    centroidText: c.representativeText,
    size: c.memberIds.length,
  }));
}
