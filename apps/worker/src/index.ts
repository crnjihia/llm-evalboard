import { type RunSuiteOptions, runSuite } from "@evalboard/core";
import { type Job, PgBoss } from "pg-boss";

export interface RunEvalJobData {
  suite: Parameters<typeof runSuite>[0];
  prompts: Parameters<typeof runSuite>[1];
  cases: Parameters<typeof runSuite>[2];
  options?: RunSuiteOptions;
}

export class WorkerService {
  private boss: PgBoss | null = null;

  constructor(
    private readonly connectionString: string = process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@localhost:5435/evalboard",
  ) {}

  async start(): Promise<void> {
    if (this.boss) return;

    this.boss = new PgBoss({
      connectionString: this.connectionString,
      schema: "pgboss",
    });

    this.boss.on("error", (error: unknown) => {
      console.error("[Worker] pg-boss error:", error);
    });

    await this.boss.start();

    // Register job handler for 'run-eval'
    await this.boss.work<RunEvalJobData>("run-eval", async (jobs: Job<RunEvalJobData>[]) => {
      const job = jobs[0];
      if (!job) return;
      const { suite, prompts, cases, options } = job.data;
      console.log(`[Worker] Starting evaluation job for suite: ${suite.name}`);

      const result = await runSuite(suite, prompts, cases, {
        ...options,
        providerResolver: () => {
          throw new Error("Worker execution requires active provider configuration");
        },
      });

      return {
        runId: result.runId,
        configHash: result.configHash,
        tasksExecuted: result.execution.totalTasksExecuted,
        costUsd: result.execution.cumulativeCostUsd,
      };
    });
  }

  async stop(): Promise<void> {
    if (this.boss) {
      await this.boss.stop();
      this.boss = null;
    }
  }

  getBoss(): PgBoss | null {
    return this.boss;
  }
}

export const WORKER_APP_NAME = "@evalboard/worker";
