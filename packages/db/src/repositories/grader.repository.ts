import { type GraderHashInput, hashGraderContent } from "@evalboard/core";
import type { DbClient } from "../client.js";
import { graderVersions } from "../schema.js";

export interface CreateGraderVersionInput extends GraderHashInput {
  name?: string;
}

export class GraderRepository {
  constructor(private readonly db: DbClient) {}

  async createVersion(input: CreateGraderVersionInput) {
    const versionId = hashGraderContent({
      type: input.type,
      config: input.config,
      judgePromptText: input.judgePromptText,
      judgeModel: input.judgeModel,
    });

    const existing = await this.db.query.graderVersions.findFirst({
      where: (gv, { eq }) => eq(gv.id, versionId),
    });

    if (existing) {
      return { version: existing, isNew: false };
    }

    const [created] = await this.db
      .insert(graderVersions)
      .values({
        id: versionId,
        type: input.type,
        name: input.name,
        config: input.config,
        judgePromptText: input.judgePromptText ?? null,
        judgeModel: input.judgeModel ?? null,
      })
      .returning();

    if (!created) {
      throw new Error(`Failed to insert grader version: ${versionId}`);
    }

    return { version: created, isNew: true };
  }

  async getVersion(versionId: string) {
    return this.db.query.graderVersions.findFirst({
      where: (gv, { eq }) => eq(gv.id, versionId),
    });
  }
}
