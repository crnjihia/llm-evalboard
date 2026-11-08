import { and, desc, eq, sql } from "drizzle-orm";
import type { DbClient } from "../client.js";
import { traceLabels, traces } from "../schema.js";

export interface IngestTraceInput {
  id: string;
  projectId?: string;
  timestamp?: Date;
  input: Record<string, unknown>;
  output: string;
  model: string;
  metadata?: Record<string, unknown>;
  feedback?:
    | {
        rating?: number;
        comment?: string;
        flagged?: boolean;
        reason?: string;
        tags?: string[];
      }
    | Record<string, unknown>;
  redacted?: boolean;
}

export interface ListTracesFilter {
  projectId?: string;
  model?: string;
  minTimestamp?: Date;
  maxTimestamp?: Date;
  label?: string;
  limit?: number;
  offset?: number;
}

export interface AddTraceLabelInput {
  traceId: string;
  label: string;
  score?: number;
  details?: Record<string, unknown>;
  labeledBy?: string;
}

export class TraceRepository {
  constructor(private readonly db: DbClient) {}

  async ingestTraces(inputs: IngestTraceInput[]): Promise<(typeof traces.$inferSelect)[]> {
    if (inputs.length === 0) return [];

    const rows = inputs.map((t) => ({
      id: t.id,
      projectId: t.projectId ?? null,
      timestamp: t.timestamp ?? new Date(),
      input: t.input,
      output: t.output,
      model: t.model,
      metadata: t.metadata ?? null,
      feedback: t.feedback ?? null,
      redacted: t.redacted ?? true,
    }));

    return this.db
      .insert(traces)
      .values(rows)
      .onConflictDoUpdate({
        target: traces.id,
        set: {
          output: sql`excluded.output`,
          metadata: sql`excluded.metadata`,
          feedback: sql`excluded.feedback`,
          redacted: sql`excluded.redacted`,
        },
      })
      .returning();
  }

  async getTrace(id: string) {
    const trace = await this.db.query.traces.findFirst({
      where: (t, { eq }) => eq(t.id, id),
    });
    if (!trace) return null;

    const labels = await this.db.query.traceLabels.findMany({
      where: (l, { eq }) => eq(l.traceId, id),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    });

    return {
      ...trace,
      labels,
    };
  }

  async listTraces(filter: ListTracesFilter = {}) {
    const conditions = [];

    if (filter.projectId) {
      conditions.push(eq(traces.projectId, filter.projectId));
    }
    if (filter.model) {
      conditions.push(eq(traces.model, filter.model));
    }
    if (filter.minTimestamp) {
      conditions.push(sql`${traces.timestamp} >= ${filter.minTimestamp.toISOString()}`);
    }
    if (filter.maxTimestamp) {
      conditions.push(sql`${traces.timestamp} <= ${filter.maxTimestamp.toISOString()}`);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const traceRows = await this.db.query.traces.findMany({
      where: whereClause,
      orderBy: [desc(traces.timestamp)],
      limit,
      offset,
    });

    return traceRows;
  }

  async addLabel(input: AddTraceLabelInput) {
    const [inserted] = await this.db
      .insert(traceLabels)
      .values({
        traceId: input.traceId,
        label: input.label,
        score: input.score,
        details: input.details,
        labeledBy: input.labeledBy ?? "flywheel",
      })
      .returning();

    return inserted;
  }

  async getLabels(traceId: string) {
    return this.db.query.traceLabels.findMany({
      where: (l, { eq }) => eq(l.traceId, traceId),
      orderBy: (l, { desc }) => [desc(l.createdAt)],
    });
  }
}
