import { desc } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { redteamRuns } from "../schema.js";

export interface CategoryBreakdownEntry {
  category: string;
  total: number;
  successful: number;
  asr: number;
  ciLower: number;
  ciUpper: number;
}

export interface SaveRedteamRunInput {
  projectId?: string;
  targetPromptVersionId?: string;
  modelConfig: {
    model: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: unknown;
  };
  asr: number;
  ciLower: number;
  ciUpper: number;
  totalAttacks: number;
  successfulAttacks: number;
  categoryBreakdown: Record<string, CategoryBreakdownEntry>;
  overRefusalRate?: number;
}

export class RedteamRepository {
  constructor(private readonly db: DbClient) {}

  async saveRun(input: SaveRedteamRunInput) {
    const [inserted] = await this.db
      .insert(redteamRuns)
      .values({
        projectId: input.projectId ?? null,
        targetPromptVersionId: input.targetPromptVersionId ?? null,
        modelConfig: input.modelConfig,
        asr: input.asr,
        ciLower: input.ciLower,
        ciUpper: input.ciUpper,
        totalAttacks: input.totalAttacks,
        successfulAttacks: input.successfulAttacks,
        categoryBreakdown: input.categoryBreakdown,
        overRefusalRate: input.overRefusalRate ?? null,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert red-team run");
    }

    return inserted;
  }

  async getRun(id: string) {
    return this.db.query.redteamRuns.findFirst({
      where: (r, { eq }) => eq(r.id, id),
    });
  }

  async listRuns(filter: { projectId?: string; limit?: number } = {}) {
    const limit = filter.limit ?? 20;
    const projectId = filter.projectId;
    return this.db.query.redteamRuns.findMany({
      where: projectId ? (r, { eq }) => eq(r.projectId, projectId) : undefined,
      orderBy: [desc(redteamRuns.createdAt)],
      limit,
    });
  }
}
