import { z } from "zod";

export const TraceFeedbackSchema = z
  .object({
    rating: z.number().optional(), // e.g. -1 (thumbs down) to 1 (thumbs up), or 1-5 scale
    comment: z.string().optional(),
    flagged: z.boolean().optional(),
    reason: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })
  .passthrough();

export type TraceFeedback = z.infer<typeof TraceFeedbackSchema>;

export const TraceInputSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().optional(),
  timestamp: z.union([z.string(), z.date()]).optional(),
  input: z.record(z.unknown()),
  output: z.string(),
  model: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  feedback: TraceFeedbackSchema.optional(),
  redacted: z.boolean().optional(),
});

export type TraceInput = z.infer<typeof TraceInputSchema>;

export type TriagePriority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type TriageAction = "PROMOTE" | "REVIEW" | "DISCARD" | "ANALYZE";

export interface TriageClassification {
  traceId: string;
  priority: TriagePriority;
  reasons: string[];
  suggestedAction: TriageAction;
  score?: number;
}

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

export interface RedactionResult {
  text: string;
  redactedCount: number;
  detectedTypes: string[];
}

export interface ObjectRedactionResult<T> {
  redacted: T;
  totalRedactions: number;
  detectedTypes: string[];
}

export interface DedupCluster {
  clusterId: string;
  representativeTraceId: string;
  traceIds: string[];
  centroidText: string;
  size: number;
}

export interface SyntheticVariation {
  variationIndex: number;
  perturbationType: string;
  input: Record<string, unknown>;
  expected?: string;
}

export interface PromotionOptions {
  traceId: string;
  datasetName: string;
  projectId?: string;
  datasetDescription?: string;
  expectedOutput?: string;
  syntheticCount?: number;
  seed?: number;
  extraTags?: string[];
  force?: boolean; // bypass duplicate warning
  dedupThreshold?: number;
}

export interface PromotionResult {
  datasetId: string;
  datasetVersionId: string;
  promotedCaseId: string;
  syntheticCaseIds: string[];
  isNewDataset: boolean;
  totalCasesInVersion: number;
}
