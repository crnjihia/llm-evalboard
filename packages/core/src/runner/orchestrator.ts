import { hashCanonical } from "../hashing.js";
import type { Suite } from "../suite.js";
import { type CostEstimateReport, estimateMatrixCost } from "./cost.js";
import {
  type AbstractProvider,
  type ExecutionReport,
  type RunProgressEvent,
  executeMatrixPlan,
} from "./executor.js";
import { type CaseReference, type PromptVersionMap, expandSuiteMatrix } from "./matrix.js";
import { captureEnvironmentSnapshot } from "./snapshot.js";

export interface RunSuiteOptions {
  runId?: string;
  concurrency?: number;
  maxCostUsd?: number;
  dryRun?: boolean;
  signal?: AbortSignal;
  completedTaskIds?: Set<string>;
  onProgress?: (event: RunProgressEvent) => void;
  providerResolver: (model: string, providerName: string) => AbstractProvider;
}

export interface RunExecutionResult {
  runId?: string;
  configHash: string;
  costEstimate: CostEstimateReport;
  execution: ExecutionReport;
  environment: ReturnType<typeof captureEnvironmentSnapshot>;
  matrix: ReturnType<typeof expandSuiteMatrix>;
}

/**
 * Orchestrates pre-run cost estimation, matrix expansion, execution, and reproducibility snapshotting.
 */
export async function runSuite(
  suite: Suite,
  prompts: PromptVersionMap,
  cases: CaseReference[],
  options: RunSuiteOptions,
): Promise<RunExecutionResult> {
  const matrix = expandSuiteMatrix(suite, prompts, cases);
  const costEstimate = estimateMatrixCost(matrix, { maxCostUsd: options.maxCostUsd });

  const environment = captureEnvironmentSnapshot();
  const configHash = hashCanonical(suite);

  const execution = await executeMatrixPlan(matrix, {
    runId: options.runId,
    concurrency: options.concurrency,
    maxCostUsd: options.maxCostUsd,
    dryRun: options.dryRun,
    signal: options.signal,
    completedTaskIds: options.completedTaskIds,
    onProgress: options.onProgress,
    providerResolver: options.providerResolver,
  });

  return {
    runId: options.runId,
    configHash,
    costEstimate,
    execution,
    environment,
    matrix,
  };
}
