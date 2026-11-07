export interface EvaluatedCaseResult {
  caseId: string;
  score?: number;
  output?: string | null;
  error?: { code: string; message: string; details?: unknown } | null;
  latencyMs?: number | null;
  costUsd?: number;
}

export interface ExcludedPair {
  caseId: string;
  baselineError?: { code: string; message: string } | null;
  candidateError?: { code: string; message: string } | null;
  reason: string;
}

export interface SymmetricExclusionResult {
  totalCaseIds: number;
  validPairs: Array<{
    caseId: string;
    baseline: EvaluatedCaseResult;
    candidate: EvaluatedCaseResult;
  }>;
  excludedPairs: ExcludedPair[];
  excludedCount: number;
  exclusionRate: number;
}

/**
 * Symmetrically excludes cases that produced errors in EITHER the baseline or candidate arm.
 * Errors are NEVER silently replaced with zeros.
 */
export function filterSymmetricPairs(
  baselineResults: EvaluatedCaseResult[],
  candidateResults: EvaluatedCaseResult[],
): SymmetricExclusionResult {
  const baselineByCase = new Map<string, EvaluatedCaseResult>();
  for (const b of baselineResults) {
    baselineByCase.set(b.caseId, b);
  }

  const candidateByCase = new Map<string, EvaluatedCaseResult>();
  for (const c of candidateResults) {
    candidateByCase.set(c.caseId, c);
  }

  const allCaseIds = new Set<string>([...baselineByCase.keys(), ...candidateByCase.keys()]);

  const validPairs: Array<{
    caseId: string;
    baseline: EvaluatedCaseResult;
    candidate: EvaluatedCaseResult;
  }> = [];

  const excludedPairs: ExcludedPair[] = [];

  for (const caseId of allCaseIds) {
    const b = baselineByCase.get(caseId);
    const c = candidateByCase.get(caseId);

    const baselineHasError = !b || (b.error !== null && b.error !== undefined);
    const candidateHasError = !c || (c.error !== null && c.error !== undefined);

    if (baselineHasError || candidateHasError) {
      const bErr = b?.error ? { code: b.error.code, message: b.error.message } : null;
      const cErr = c?.error ? { code: c.error.code, message: c.error.message } : null;

      let reason = "Case errored in both arms";
      if (baselineHasError && !candidateHasError) {
        reason = "Case errored in baseline arm (symmetrically excluded from pair)";
      } else if (!baselineHasError && candidateHasError) {
        reason = "Case errored in candidate arm (symmetrically excluded from pair)";
      }

      excludedPairs.push({
        caseId,
        baselineError: bErr,
        candidateError: cErr,
        reason,
      });
    } else {
      validPairs.push({
        caseId,
        baseline: b,
        candidate: c,
      });
    }
  }

  const total = allCaseIds.size;
  const excludedCount = excludedPairs.length;
  const exclusionRate = total > 0 ? excludedCount / total : 0;

  return {
    totalCaseIds: total,
    validPairs,
    excludedPairs,
    excludedCount,
    exclusionRate,
  };
}
