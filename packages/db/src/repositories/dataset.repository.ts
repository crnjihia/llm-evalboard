import { type CaseHashInput, hashCaseContent, hashDatasetVersion } from "@evalboard/core";
import type { DbClient } from "../client.js";
import { cases, datasetVersions, datasets } from "../schema.js";

export interface CreateDatasetInput {
  name: string;
  projectId?: string;
  description?: string;
}

export interface CaseInput extends CaseHashInput {
  split?: string;
}

export interface CreateDatasetVersionInput {
  datasetId: string;
  cases: CaseInput[];
}

export class DatasetRepository {
  constructor(private readonly db: DbClient) {}

  async getOrCreateDataset(input: CreateDatasetInput) {
    const projectId = input.projectId;
    if (projectId) {
      const existing = await this.db.query.datasets.findFirst({
        where: (d, { and, eq }) => and(eq(d.name, input.name), eq(d.projectId, projectId)),
      });
      if (existing) return existing;
    } else {
      const existing = await this.db.query.datasets.findFirst({
        where: (d, { eq }) => eq(d.name, input.name),
      });
      if (existing) return existing;
    }

    const [created] = await this.db
      .insert(datasets)
      .values({
        name: input.name,
        projectId: input.projectId,
        description: input.description,
      })
      .returning();

    if (!created) {
      throw new Error(`Failed to create dataset: ${input.name}`);
    }
    return created;
  }

  async createVersion(input: CreateDatasetVersionInput) {
    const computedCases = input.cases.map((c, index) => {
      const caseId = hashCaseContent({
        input: c.input,
        expected: c.expected,
        metadata: c.metadata,
        tags: c.tags,
      });
      return {
        ...c,
        caseId,
        caseIndex: index,
      };
    });

    const caseHashes = computedCases.map((c) => c.caseId);
    const versionId = hashDatasetVersion(caseHashes);

    const existing = await this.db.query.datasetVersions.findFirst({
      where: (dv, { eq }) => eq(dv.id, versionId),
    });

    if (existing) {
      return { version: existing, isNew: false };
    }

    // Transactional write of version and cases
    const result = await this.db.transaction(async (tx) => {
      const [newVersion] = await tx
        .insert(datasetVersions)
        .values({
          id: versionId,
          datasetId: input.datasetId,
          caseCount: computedCases.length,
          caseHashes,
        })
        .returning();

      if (!newVersion) {
        throw new Error(`Failed to insert dataset version: ${versionId}`);
      }

      if (computedCases.length > 0) {
        const caseRows = computedCases.map((c) => ({
          id: c.caseId,
          datasetVersionId: versionId,
          caseIndex: c.caseIndex,
          input: c.input,
          expected: c.expected,
          metadata: c.metadata ?? null,
          tags: c.tags ?? [],
          split: c.split ?? "test",
        }));

        await tx.insert(cases).values(caseRows);
      }

      return newVersion;
    });

    return { version: result, isNew: true };
  }

  async getVersion(versionId: string) {
    return this.db.query.datasetVersions.findFirst({
      where: (dv, { eq }) => eq(dv.id, versionId),
    });
  }

  async getLatestVersion(datasetId: string) {
    return this.db.query.datasetVersions.findFirst({
      where: (dv, { eq }) => eq(dv.datasetId, datasetId),
      orderBy: (dv, { desc }) => [desc(dv.createdAt)],
    });
  }

  async getCases(versionId: string) {
    return this.db.query.cases.findMany({
      where: (c, { eq }) => eq(c.datasetVersionId, versionId),
      orderBy: (c, { asc }) => [asc(c.caseIndex)],
    });
  }
}
