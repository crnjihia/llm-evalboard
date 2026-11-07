import { renderTemplateString } from "../prompts/template.js";
import { estimateMatrixCost } from "./cost.js";
import type { ExecutionTask, MatrixPlan } from "./matrix.js";

export interface ProviderCallResponse {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    originalCostUsd?: number;
  };
  latencyMs: number;
  cached: boolean;
  finishReason?: string;
  raw?: unknown;
}

export interface AbstractProvider {
  name: string;
  generate(req: {
    model: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    params?: Record<string, unknown>;
    signal?: AbortSignal;
  }): Promise<ProviderCallResponse>;
}

export interface TaskExecutionResult {
  taskId: string;
  cellId: string;
  caseId: string;
  repeatIndex: number;
  promptVersionId: string;
  output: string | null;
  error: { code: string; message: string; details?: unknown } | null;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
    originalCostUsd?: number;
  };
  latencyMs: number;
  cached: boolean;
}

export interface RunProgressEvent {
  runId?: string;
  totalTasks: number;
  completedTasks: number;
  remainingTasks: number;
  cumulativeCostUsd: number;
  percent: number;
  lastCompletedTask?: TaskExecutionResult;
}

export interface CellExecutionSummary {
  cellId: string;
  totalTasks: number;
  completedTasks: number;
  errorCount: number;
  errorRate: number;
  totalCostUsd: number;
}

export interface ExecutionEngineOptions {
  runId?: string;
  concurrency?: number; // default 5
  maxCostUsd?: number;
  dryRun?: boolean;
  signal?: AbortSignal;
  completedTaskIds?: Set<string>;
  onProgress?: (event: RunProgressEvent) => void;
  providerResolver: (model: string, providerName: string) => AbstractProvider;
}

export interface ExecutionReport {
  results: TaskExecutionResult[];
  cellSummaries: Record<string, CellExecutionSummary>;
  cumulativeCostUsd: number;
  totalTasksExecuted: number;
  tasksSkippedDueToResumption: number;
  isDryRun: boolean;
  costCapExceeded: boolean;
  error?: string;
}

export class CostCapExceededError extends Error {
  constructor(
    public readonly currentCost: number,
    public readonly maxCost: number,
  ) {
    super(
      `Run aborted: spend ($${currentCost.toFixed(4)}) reached max cost cap ($${maxCost.toFixed(2)})`,
    );
    this.name = "CostCapExceededError";
  }
}

/**
 * Executes a MatrixPlan with bounded concurrency, resumability, cost controls, and progress tracking.
 */
export async function executeMatrixPlan(
  plan: MatrixPlan,
  options: ExecutionEngineOptions,
): Promise<ExecutionReport> {
  const concurrency = Math.max(1, options.concurrency ?? 5);
  const completedTaskIds = options.completedTaskIds ?? new Set<string>();

  // Dry run mode
  if (options.dryRun) {
    estimateMatrixCost(plan, { maxCostUsd: options.maxCostUsd });
    return {
      results: [],
      cellSummaries: {},
      cumulativeCostUsd: 0,
      totalTasksExecuted: 0,
      tasksSkippedDueToResumption: 0,
      isDryRun: true,
      costCapExceeded: false,
    };
  }

  // Filter tasks for resumability
  const pendingTasks: ExecutionTask[] = [];
  let tasksSkippedDueToResumption = 0;

  for (const task of plan.tasks) {
    if (completedTaskIds.has(task.taskId)) {
      tasksSkippedDueToResumption++;
    } else {
      pendingTasks.push(task);
    }
  }

  const results: TaskExecutionResult[] = [];
  let cumulativeCostUsd = 0;
  let costCapExceeded = false;
  let abortReason: string | undefined;

  const totalTasks = plan.totalTasks;
  let completedSoFar = tasksSkippedDueToResumption;

  // Process tasks in bounded concurrent chunks
  for (let i = 0; i < pendingTasks.length; i += concurrency) {
    if (options.signal?.aborted) {
      abortReason = "Execution cancelled by abort signal";
      break;
    }

    // Check hard cost cap before dispatching batch
    if (options.maxCostUsd !== undefined && cumulativeCostUsd >= options.maxCostUsd) {
      costCapExceeded = true;
      abortReason = `Execution stopped: reached cost cap of $${options.maxCostUsd.toFixed(2)} USD`;
      break;
    }

    const chunk = pendingTasks.slice(i, i + concurrency);

    const chunkPromises = chunk.map(async (task) => {
      const provider = options.providerResolver(task.modelConfig.model, task.modelConfig.provider);

      // Render prompt template
      let promptText: string;
      try {
        if (typeof task.template === "string") {
          promptText = renderTemplateString(task.template, task.caseInput, { strict: false });
        } else {
          promptText = JSON.stringify(task.template);
        }
      } catch (renderErr) {
        return {
          taskId: task.taskId,
          cellId: task.cellId,
          caseId: task.caseId,
          repeatIndex: task.repeatIndex,
          promptVersionId: task.promptVersionId,
          output: null,
          error: {
            code: "invalid_request",
            message: `Template rendering failed: ${renderErr instanceof Error ? renderErr.message : String(renderErr)}`,
          },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
          latencyMs: 0,
          cached: false,
        };
      }

      const startTime = Date.now();
      try {
        const response = await provider.generate({
          model: task.modelConfig.model,
          messages: [{ role: "user", content: promptText }],
          params: (task.modelConfig.parameters as Record<string, unknown>) ?? {},
          signal: options.signal,
        });

        const taskResult: TaskExecutionResult = {
          taskId: task.taskId,
          cellId: task.cellId,
          caseId: task.caseId,
          repeatIndex: task.repeatIndex,
          promptVersionId: task.promptVersionId,
          output: response.text,
          error: null,
          usage: response.usage,
          latencyMs: response.latencyMs || Math.max(1, Date.now() - startTime),
          cached: response.cached,
        };

        return taskResult;
      } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : String(err);
        const errCode =
          typeof err === "object" && err !== null && "code" in err
            ? String((err as { code: unknown }).code)
            : "provider_error";

        const taskResult: TaskExecutionResult = {
          taskId: task.taskId,
          cellId: task.cellId,
          caseId: task.caseId,
          repeatIndex: task.repeatIndex,
          promptVersionId: task.promptVersionId,
          output: null,
          error: { code: errCode, message: errMessage, details: err },
          usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 },
          latencyMs: Math.max(1, Date.now() - startTime),
          cached: false,
        };

        return taskResult;
      }
    });

    const chunkResults = await Promise.all(chunkPromises);

    for (const res of chunkResults) {
      results.push(res);
      cumulativeCostUsd += res.usage.costUsd;
      completedSoFar++;

      if (options.onProgress) {
        options.onProgress({
          runId: options.runId,
          totalTasks,
          completedTasks: completedSoFar,
          remainingTasks: totalTasks - completedSoFar,
          cumulativeCostUsd,
          percent: Math.round((completedSoFar / totalTasks) * 100),
          lastCompletedTask: res,
        });
      }

      // Check cost cap inside batch
      if (options.maxCostUsd !== undefined && cumulativeCostUsd >= options.maxCostUsd) {
        costCapExceeded = true;
      }
    }

    if (costCapExceeded) {
      abortReason = `Cost cap of $${options.maxCostUsd?.toFixed(2)} reached`;
      break;
    }
  }

  // Calculate per-cell summaries and error rates
  const cellSummaries: Record<string, CellExecutionSummary> = {};
  for (const cell of plan.cells) {
    cellSummaries[cell.cellId] = {
      cellId: cell.cellId,
      totalTasks: 0,
      completedTasks: 0,
      errorCount: 0,
      errorRate: 0,
      totalCostUsd: 0,
    };
  }

  for (const res of results) {
    const summary = cellSummaries[res.cellId];
    if (summary) {
      summary.totalTasks++;
      summary.completedTasks++;
      summary.totalCostUsd += res.usage.costUsd;
      if (res.error !== null) {
        summary.errorCount++;
      }
    }
  }

  for (const summary of Object.values(cellSummaries)) {
    if (summary.totalTasks > 0) {
      summary.errorRate = summary.errorCount / summary.totalTasks;
    }
  }

  return {
    results,
    cellSummaries,
    cumulativeCostUsd,
    totalTasksExecuted: results.length,
    tasksSkippedDueToResumption,
    isDryRun: false,
    costCapExceeded,
    error: abortReason,
  };
}
