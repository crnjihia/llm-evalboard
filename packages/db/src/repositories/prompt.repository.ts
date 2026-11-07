import { type PromptHashInput, hashPromptContent } from "@evalboard/core";
import type { DbClient } from "../client.js";
import { promptVersions, prompts } from "../schema.js";

export interface CreatePromptInput {
  name: string;
  projectId?: string;
  description?: string;
}

export interface CreatePromptVersionInput extends PromptHashInput {
  promptId: string;
}

export class PromptRepository {
  constructor(private readonly db: DbClient) {}

  async getOrCreatePrompt(input: CreatePromptInput) {
    const projectId = input.projectId;
    if (projectId) {
      const existing = await this.db.query.prompts.findFirst({
        where: (p, { and, eq }) => and(eq(p.name, input.name), eq(p.projectId, projectId)),
      });
      if (existing) return existing;
    } else {
      const existing = await this.db.query.prompts.findFirst({
        where: (p, { eq }) => eq(p.name, input.name),
      });
      if (existing) return existing;
    }

    const [created] = await this.db
      .insert(prompts)
      .values({
        name: input.name,
        projectId: input.projectId,
        description: input.description,
      })
      .returning();

    if (!created) {
      throw new Error(`Failed to create prompt: ${input.name}`);
    }
    return created;
  }

  async createVersion(input: CreatePromptVersionInput) {
    const versionId = hashPromptContent({
      template: input.template,
      variablesSchema: input.variablesSchema,
      messageStructure: input.messageStructure,
    });

    const existing = await this.db.query.promptVersions.findFirst({
      where: (pv, { eq }) => eq(pv.id, versionId),
    });

    if (existing) {
      return { version: existing, isNew: false };
    }

    const [created] = await this.db
      .insert(promptVersions)
      .values({
        id: versionId,
        promptId: input.promptId,
        template: input.template,
        variablesSchema: input.variablesSchema ?? null,
        messageStructure: input.messageStructure ?? null,
      })
      .returning();

    if (!created) {
      throw new Error(`Failed to insert prompt version: ${versionId}`);
    }

    return { version: created, isNew: true };
  }

  async getVersion(versionId: string) {
    return this.db.query.promptVersions.findFirst({
      where: (pv, { eq }) => eq(pv.id, versionId),
    });
  }

  async listVersions(promptId: string) {
    return this.db.query.promptVersions.findMany({
      where: (pv, { eq }) => eq(pv.promptId, promptId),
      orderBy: (pv, { desc }) => [desc(pv.createdAt)],
    });
  }
}
