import type { ParsedCase } from "./parser.js";

export interface ChangedCase {
  oldCase: ParsedCase;
  newCase: ParsedCase;
  fieldChanges: string[];
}

export interface DatasetDiffResult {
  addedCases: ParsedCase[];
  removedCases: ParsedCase[];
  changedCases: ChangedCase[];
  unchangedCount: number;
  summary: string;
}

/**
 * Computes difference between two dataset versions.
 */
export function computeDatasetDiff(
  oldCases: ParsedCase[],
  newCases: ParsedCase[],
): DatasetDiffResult {
  const oldById = new Map<string, ParsedCase>(oldCases.map((c) => [c.id, c]));
  const newById = new Map<string, ParsedCase>(newCases.map((c) => [c.id, c]));

  const addedCases: ParsedCase[] = [];
  const removedCases: ParsedCase[] = [];
  const changedCases: ChangedCase[] = [];
  let unchangedCount = 0;

  for (const newCase of newCases) {
    if (oldById.has(newCase.id)) {
      unchangedCount++;
    } else {
      // Check if there is an old case with identical input but modified expected/tags/split
      const matchingInputOld = oldCases.find(
        (oc) => JSON.stringify(oc.input) === JSON.stringify(newCase.input),
      );

      if (matchingInputOld) {
        const fieldChanges: string[] = [];
        if (JSON.stringify(matchingInputOld.expected) !== JSON.stringify(newCase.expected)) {
          fieldChanges.push("expected");
        }
        if (matchingInputOld.split !== newCase.split) {
          fieldChanges.push("split");
        }
        if (JSON.stringify(matchingInputOld.tags) !== JSON.stringify(newCase.tags)) {
          fieldChanges.push("tags");
        }
        changedCases.push({
          oldCase: matchingInputOld,
          newCase,
          fieldChanges,
        });
      } else {
        addedCases.push(newCase);
      }
    }
  }

  for (const oldCase of oldCases) {
    if (!newById.has(oldCase.id)) {
      // Only count as removed if it wasn't recorded as changed
      const wasChanged = changedCases.some((cc) => cc.oldCase.id === oldCase.id);
      if (!wasChanged) {
        removedCases.push(oldCase);
      }
    }
  }

  const parts: string[] = [];
  if (addedCases.length > 0) parts.push(`+${addedCases.length} added`);
  if (removedCases.length > 0) parts.push(`-${removedCases.length} removed`);
  if (changedCases.length > 0) parts.push(`${changedCases.length} changed`);
  parts.push(`${unchangedCount} unchanged`);

  const summary = parts.join(", ");

  return {
    addedCases,
    removedCases,
    changedCases,
    unchangedCount,
    summary,
  };
}
