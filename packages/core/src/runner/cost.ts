import type { MatrixPlan } from "./matrix.js";

// Pricing table rates lookup helper (importing or calculating directly from pricing logic)
interface ModelRate {
  inputPerMillion: number;
  outputPerMillion: number;
}

const DEFAULT_RATES: Record<string, ModelRate> = {
  "claude-3-5-sonnet-20241022": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-3-5-sonnet-latest": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-3-7-sonnet-20250219": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-3-7-sonnet-latest": { inputPerMillion: 3.0, outputPerMillion: 15.0 },
  "claude-3-5-haiku-20241022": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "claude-3-5-haiku-latest": { inputPerMillion: 0.8, outputPerMillion: 4.0 },
  "claude-3-opus-20240229": { inputPerMillion: 15.0, outputPerMillion: 75.0 },
  "meta-llama/llama-3.3-70b-instruct": { inputPerMillion: 0.12, outputPerMillion: 0.3 },
  "meta-llama/llama-3.1-8b-instruct": { inputPerMillion: 0.055, outputPerMillion: 0.055 },
  "deepseek/deepseek-r1": { inputPerMillion: 0.55, outputPerMillion: 2.19 },
};

function getModelRate(model: string): ModelRate {
  const norm = model.toLowerCase();
  for (const [key, rate] of Object.entries(DEFAULT_RATES)) {
    if (norm.includes(key.toLowerCase())) {
      return rate;
    }
  }
  if (norm.startsWith("ollama") || norm.startsWith("mock")) {
    return { inputPerMillion: 0.0, outputPerMillion: 0.0 };
  }
  return { inputPerMillion: 1.0, outputPerMillion: 2.0 }; // conservative fallback
}

export interface CostEstimateReport {
  totalEstimatedTasks: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  totalEstimatedCostUsd: number;
  costPerCell: Record<string, { cellId: string; model: string; estimatedCostUsd: number }>;
  maxCostUsd?: number;
  exceedsCap: boolean;
  summary: string;
}

export interface EstimateOptions {
  assumedOutputTokensPerTask?: number; // default 300
  maxCostUsd?: number;
}

/**
 * Computes a pre-run cost estimation before calling any paid API.
 */
export function estimateMatrixCost(
  plan: MatrixPlan,
  options: EstimateOptions = {},
): CostEstimateReport {
  const assumedOutputTokens = options.assumedOutputTokensPerTask ?? 300;
  const maxCostUsd = options.maxCostUsd;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const costPerCell: Record<string, { cellId: string; model: string; estimatedCostUsd: number }> =
    {};

  for (const cell of plan.cells) {
    costPerCell[cell.cellId] = {
      cellId: cell.cellId,
      model: cell.modelConfig.model,
      estimatedCostUsd: 0,
    };
  }

  for (const task of plan.tasks) {
    const templateLen =
      typeof task.template === "string"
        ? task.template.length
        : JSON.stringify(task.template).length;
    const inputLen = JSON.stringify(task.caseInput).length;
    const taskInputTokens = Math.max(1, Math.round((templateLen + inputLen) / 4));
    const taskOutputTokens = assumedOutputTokens;

    totalInputTokens += taskInputTokens;
    totalOutputTokens += taskOutputTokens;

    const rate = getModelRate(task.modelConfig.model);
    const taskCost =
      (taskInputTokens / 1_000_000) * rate.inputPerMillion +
      (taskOutputTokens / 1_000_000) * rate.outputPerMillion;

    totalCostUsd += taskCost;
    const cellEntry = costPerCell[task.cellId];
    if (cellEntry) {
      cellEntry.estimatedCostUsd += taskCost;
    }
  }

  const roundedCost = Math.round(totalCostUsd * 10000) / 10000;
  const exceedsCap = maxCostUsd !== undefined && roundedCost > maxCostUsd;

  const summary = `Estimated cost: $${roundedCost.toFixed(4)} USD across ${plan.totalTasks} task(s) (${totalInputTokens} est. input tokens, ${totalOutputTokens} est. output tokens).${
    maxCostUsd !== undefined ? ` [Max budget: $${maxCostUsd.toFixed(2)}]` : ""
  }`;

  return {
    totalEstimatedTasks: plan.totalTasks,
    estimatedInputTokens: totalInputTokens,
    estimatedOutputTokens: totalOutputTokens,
    totalEstimatedCostUsd: roundedCost,
    costPerCell,
    maxCostUsd,
    exceedsCap,
    summary,
  };
}
