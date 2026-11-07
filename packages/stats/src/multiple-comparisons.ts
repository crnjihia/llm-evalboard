export type MultipleTestingMethod = "holm" | "bh";

export interface AdjustedPValueResult {
  rawPValue: number;
  adjustedPValue: number;
  significant: boolean;
}

/**
 * Adjusts p-values for family-wise error rate control using the Holm step-down method.
 * Guarantees FWER <= alpha without being as overly conservative as standard Bonferroni.
 */
export function adjustPValuesHolm(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  if (m === 1) return [pValues[0] ?? 0];

  const indexed = pValues.map((p, idx) => ({ p, idx }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(m);
  let runningMax = 0;

  for (let rank = 0; rank < m; rank++) {
    const item = indexed[rank];
    if (!item) continue;
    const factor = m - rank;
    const adj = Math.min(1.0, factor * item.p);
    runningMax = Math.max(runningMax, adj);
    adjusted[item.idx] = runningMax;
  }

  return adjusted;
}

/**
 * Adjusts p-values for False Discovery Rate (FDR) control using the Benjamini-Hochberg method.
 */
export function adjustPValuesBh(pValues: number[]): number[] {
  const m = pValues.length;
  if (m === 0) return [];
  if (m === 1) return [pValues[0] ?? 0];

  const indexed = pValues.map((p, idx) => ({ p, idx }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted = new Array<number>(m);
  let runningMin = 1.0;

  for (let rank = m - 1; rank >= 0; rank--) {
    const item = indexed[rank];
    if (!item) continue;
    const i = rank + 1;
    const adj = Math.min(1.0, (m / i) * item.p);
    runningMin = Math.min(runningMin, adj);
    adjusted[item.idx] = runningMin;
  }

  return adjusted;
}

/**
 * Adjusts a list of p-values using the specified multiple testing procedure.
 */
export function adjustPValues(pValues: number[], method: MultipleTestingMethod = "holm"): number[] {
  return method === "bh" ? adjustPValuesBh(pValues) : adjustPValuesHolm(pValues);
}

/**
 * Evaluates significance for an array of p-values after adjustment.
 */
export function evaluateMultipleTests(
  pValues: number[],
  options?: { method?: MultipleTestingMethod; alpha?: number },
): AdjustedPValueResult[] {
  const method = options?.method ?? "holm";
  const alpha = options?.alpha ?? 0.05;

  const adjusted = adjustPValues(pValues, method);

  return pValues.map((raw, idx) => {
    const adj = adjusted[idx] ?? raw;
    return {
      rawPValue: raw,
      adjustedPValue: adj,
      significant: adj < alpha,
    };
  });
}
