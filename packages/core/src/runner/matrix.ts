import type { ModelConfig, PromptVersion } from "../domain.js";
import type { Suite } from "../suite.js";

export interface ResolvedCell {
  cellId: string;
  promptVersionId: string;
  promptName: string;
  template: string | Array<{ role: string; content: string }>;
  modelConfig: ModelConfig;
  isBaseline: boolean;
}

export interface ExecutionTask {
  taskId: string;
  cellId: string;
  promptVersionId: string;
  promptName: string;
  template: string | Array<{ role: string; content: string }>;
  modelConfig: ModelConfig;
  caseId: string;
  caseIndex: number;
  caseInput: Record<string, unknown>;
  expected?: unknown;
  tags: string[];
  repeatIndex: number;
  isBaseline: boolean;
}

export interface MatrixPlan {
  cells: ResolvedCell[];
  tasks: ExecutionTask[];
  totalTasks: number;
  repeats: number;
  baselineCell: ResolvedCell | null;
}

export interface PromptVersionMap {
  [promptReference: string]: {
    version: PromptVersion;
    name: string;
  };
}

export interface CaseReference {
  id: string;
  caseIndex: number;
  input: Record<string, unknown>;
  expected?: unknown;
  tags?: string[];
}

/**
 * Expands a declarative Suite into matrix cells and execution tasks.
 */
export function expandSuiteMatrix(
  suite: Suite,
  promptMap: PromptVersionMap,
  cases: CaseReference[],
): MatrixPlan {
  const cells: ResolvedCell[] = [];
  const tasks: ExecutionTask[] = [];

  let cellCounter = 0;

  for (const promptRef of suite.prompts) {
    const promptEntry = promptMap[promptRef];
    if (!promptEntry) {
      throw new Error(`Unresolved prompt reference: '${promptRef}'`);
    }

    const { version, name } = promptEntry;

    for (const modelConfig of suite.models) {
      cellCounter++;
      const cellId = `cell_${cellCounter}_${version.id.slice(0, 8)}_${modelConfig.model.replace(/[^a-zA-Z0-9_-]/g, "_")}`;

      const isBaseline =
        (suite.baseline.prompt === promptRef ||
          suite.baseline.prompt === name ||
          suite.baseline.prompt === version.id) &&
        (suite.baseline.model === modelConfig.model ||
          suite.baseline.model === `${modelConfig.provider}:${modelConfig.model}`);

      const cell: ResolvedCell = {
        cellId,
        promptVersionId: version.id,
        promptName: name,
        template: version.template,
        modelConfig,
        isBaseline,
      };

      cells.push(cell);

      for (const c of cases) {
        for (let repeat = 0; repeat < suite.repeats; repeat++) {
          const taskId = `${cellId}_case_${c.caseIndex}_repeat_${repeat}`;
          tasks.push({
            taskId,
            cellId,
            promptVersionId: version.id,
            promptName: name,
            template: version.template,
            modelConfig,
            caseId: c.id,
            caseIndex: c.caseIndex,
            caseInput: c.input,
            expected: c.expected,
            tags: c.tags ?? [],
            repeatIndex: repeat,
            isBaseline,
          });
        }
      }
    }
  }

  const baselineCell = cells.find((c) => c.isBaseline) ?? cells[0] ?? null;

  return {
    cells,
    tasks,
    totalTasks: tasks.length,
    repeats: suite.repeats,
    baselineCell,
  };
}
