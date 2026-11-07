import { createTwoFilesPatch, diffLines } from "diff";

export interface PromptDiffResult {
  linesAdded: number;
  linesRemoved: number;
  linesUnchanged: number;
  patch: string;
  summary: string;
}

function stringifyTemplate(template: string | Array<{ role: string; content: string }>): string {
  if (typeof template === "string") {
    return template;
  }
  return template.map((m) => `[${m.role.toUpperCase()}]:\n${m.content}`).join("\n\n");
}

/**
 * Computes a textual diff between two prompt versions and generates a human-readable summary.
 */
export function computePromptDiff(
  oldTemplate: string | Array<{ role: string; content: string }>,
  newTemplate: string | Array<{ role: string; content: string }>,
  oldLabel = "baseline",
  newLabel = "candidate",
): PromptDiffResult {
  const strA = stringifyTemplate(oldTemplate);
  const strB = stringifyTemplate(newTemplate);

  const changes = diffLines(strA, strB);
  let linesAdded = 0;
  let linesRemoved = 0;
  let linesUnchanged = 0;

  for (const part of changes) {
    const lineCount = (part.value.match(/\n/g) || []).length + (part.value.endsWith("\n") ? 0 : 1);
    if (part.added) {
      linesAdded += lineCount;
    } else if (part.removed) {
      linesRemoved += lineCount;
    } else {
      linesUnchanged += lineCount;
    }
  }

  const patch = createTwoFilesPatch(oldLabel, newLabel, strA, strB);

  let summary = "No changes";
  if (linesAdded > 0 || linesRemoved > 0) {
    const parts: string[] = [];
    if (linesAdded > 0) parts.push(`+${linesAdded} ${linesAdded === 1 ? "line" : "lines"}`);
    if (linesRemoved > 0) parts.push(`-${linesRemoved} ${linesRemoved === 1 ? "line" : "lines"}`);
    summary = `Prompt updated: ${parts.join(", ")}`;
  }

  return {
    linesAdded,
    linesRemoved,
    linesUnchanged,
    patch,
    summary,
  };
}
