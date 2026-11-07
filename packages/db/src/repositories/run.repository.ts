import type { ModelConfig, RunStatus, Usage } from "@evalboard/core";
import { eq } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { caseResults, graderResults, runCells, runs } from "../schema.js";

export interface CreateRunCellInput {
  promptVersionId: string;
  modelConfig: ModelConfig;
  isBaseline?: boolean;
}

export interface CreateRunInput {
  id?: string;
  projectId?: string;
  suiteName: string;
  gitSha?: string;
  configHash: string;
  resolvedConfig: Record<string, unknown>;
  datasetVersionId: string;
  promptVersionIds: string[];
  models: ModelConfig[];
  graderVersionIds: string[];
  seeds?: number[];
  repeats?: number;
  usage?: Usage;
  cells: CreateRunCellInput[];
}

export interface RecordCaseResultInput {
  runCellId: string;
  caseId: string;
  repeatIndex?: number;
  output?: string;
  latencyMs?: number;
  usage?: Usage;
  error?: { code: string; message: string; details?: unknown };
  cached?: boolean;
  graders: Array<{
    graderVersionId: string;
    score: number;
    pass: boolean;
    reason: string;
    details?: Record<string, unknown>;
  }>;
}

export class RunRepository {
  constructor(private readonly db: DbClient) {}

  async createRun(input: CreateRunInput) {
    return this.db.transaction(async (tx) => {
      const [newRun] = await tx
        .insert(runs)
        .values({
          id: input.id,
          projectId: input.projectId,
          suiteName: input.suiteName,
          gitSha: input.gitSha,
          configHash: input.configHash,
          resolvedConfig: input.resolvedConfig,
          datasetVersionId: input.datasetVersionId,
          promptVersionIds: input.promptVersionIds,
          models: input.models,
          graderVersionIds: input.graderVersionIds,
          seeds: input.seeds ?? [],
          repeats: input.repeats ?? 1,
          usage: input.usage ?? {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costUsd: 0,
            judgeCostUsd: 0,
          },
          status: "pending",
        })
        .returning();

      if (!newRun) {
        throw new Error("Failed to insert run record");
      }

      const cellRows = input.cells.map((cell) => ({
        runId: newRun.id,
        promptVersionId: cell.promptVersionId,
        modelConfig: cell.modelConfig,
        isBaseline: cell.isBaseline ?? false,
        status: "pending",
        errorRate: 0,
      }));

      const createdCells = await tx.insert(runCells).values(cellRows).returning();

      return { run: newRun, cells: createdCells };
    });
  }

  async getRun(runId: string) {
    const run = await this.db.query.runs.findFirst({
      where: (r, { eq }) => eq(r.id, runId),
    });
    if (!run) return null;

    const cells = await this.db.query.runCells.findMany({
      where: (rc, { eq }) => eq(rc.runId, runId),
    });

    return { ...run, cells };
  }

  async recordCaseResult(input: RecordCaseResultInput) {
    return this.db.transaction(async (tx) => {
      const [caseResult] = await tx
        .insert(caseResults)
        .values({
          runCellId: input.runCellId,
          caseId: input.caseId,
          repeatIndex: input.repeatIndex ?? 0,
          output: input.output ?? null,
          latencyMs: input.latencyMs ?? null,
          usage: input.usage ?? null,
          error: input.error ?? null,
          cached: input.cached ?? false,
        })
        .returning();

      if (!caseResult) {
        throw new Error("Failed to insert case result record");
      }

      let insertedGraders: (typeof graderResults.$inferSelect)[] = [];
      if (input.graders && input.graders.length > 0) {
        const graderRows = input.graders.map((g) => ({
          caseResultId: caseResult.id,
          graderVersionId: g.graderVersionId,
          score: g.score,
          pass: g.pass,
          reason: g.reason,
          details: g.details ?? null,
        }));

        insertedGraders = await tx.insert(graderResults).values(graderRows).returning();
      }

      return { caseResult, graderResults: insertedGraders };
    });
  }

  async updateRunStatus(runId: string, status: RunStatus, usage?: Usage, error?: string) {
    const [updated] = await this.db
      .update(runs)
      .set({
        status,
        ...(usage ? { usage } : {}),
        ...(error !== undefined ? { error } : {}),
      })
      .where(eq(runs.id, runId))
      .returning();

    return updated;
  }
}
