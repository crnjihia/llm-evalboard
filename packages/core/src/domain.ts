import { z } from "zod";

/**
 * Usage metrics (tokens & spend)
 */
export const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  totalTokens: z.number().int().nonnegative().default(0),
  costUsd: z.number().nonnegative().default(0),
  judgeCostUsd: z.number().nonnegative().optional(),
});

export type Usage = z.infer<typeof usageSchema>;

/**
 * Model configuration
 */
export const modelConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai", "ollama", "openrouter", "mock"]).or(z.string()),
  model: z.string().min(1, "Model ID cannot be empty"),
  parameters: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().optional(),
      topP: z.number().min(0).max(1).optional(),
      seed: z.number().int().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export type ModelConfig = z.infer<typeof modelConfigSchema>;

/**
 * Project
 */
export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
  updatedAt: z.coerce.date().default(() => new Date()),
});

export type Project = z.infer<typeof projectSchema>;

/**
 * Prompt & Content-Addressed PromptVersion
 */
export const promptSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type Prompt = z.infer<typeof promptSchema>;

export const promptVersionSchema = z.object({
  id: z.string().length(64, "Prompt version ID must be a sha256 hex string"),
  promptId: z.string().uuid(),
  template: z.string().or(z.array(z.object({ role: z.string(), content: z.string() }))),
  variablesSchema: z.record(z.unknown()).optional().nullable(),
  messageStructure: z.string().optional().nullable(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type PromptVersion = z.infer<typeof promptVersionSchema>;

/**
 * Dataset, DatasetVersion & Cases
 */
export const datasetSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type Dataset = z.infer<typeof datasetSchema>;

export const datasetVersionSchema = z.object({
  id: z.string().length(64, "Dataset version ID must be a sha256 hex string"),
  datasetId: z.string().uuid(),
  caseCount: z.number().int().nonnegative(),
  caseHashes: z.array(z.string().length(64)),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type DatasetVersion = z.infer<typeof datasetVersionSchema>;

export const caseSchema = z.object({
  id: z.string().length(64, "Case ID must be its sha256 content hash"),
  datasetVersionId: z.string().length(64),
  caseIndex: z.number().int().nonnegative(),
  input: z.record(z.unknown()),
  expected: z.unknown().optional(),
  metadata: z.record(z.unknown()).optional().nullable(),
  tags: z.array(z.string()).default([]),
  split: z.enum(["dev", "test", "tuning", "promoted"]).or(z.string()).default("test"),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type Case = z.infer<typeof caseSchema>;

/**
 * GraderConfig, GraderVersion & GraderResult
 */
export const graderConfigSchema = z.object({
  type: z
    .enum(["exact", "contains", "regex", "json-schema", "numeric", "llm-rubric", "pairwise"])
    .or(z.string()),
  name: z.string().optional(),
  config: z.record(z.unknown()).default({}),
  judgePromptText: z.string().optional().nullable(),
  judgeModel: modelConfigSchema.optional().nullable(),
});

export type GraderConfig = z.infer<typeof graderConfigSchema>;

export const graderVersionSchema = z.object({
  id: z.string().length(64, "Grader version ID must be a sha256 hex string"),
  type: z.string(),
  name: z.string().optional().nullable(),
  config: z.record(z.unknown()),
  judgePromptText: z.string().optional().nullable(),
  judgeModel: modelConfigSchema.optional().nullable(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type GraderVersion = z.infer<typeof graderVersionSchema>;

export const graderResultSchema = z.object({
  id: z.string().uuid(),
  caseResultId: z.string().uuid(),
  graderVersionId: z.string().length(64),
  score: z.number().min(0).max(1),
  pass: z.boolean(),
  reason: z.string(),
  details: z.record(z.unknown()).optional().nullable(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type GraderResult = z.infer<typeof graderResultSchema>;

/**
 * Run, RunCell & CaseResult
 */
export const runCellSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  promptVersionId: z.string().length(64),
  modelConfig: modelConfigSchema,
  isBaseline: z.boolean().default(false),
  status: z.enum(["pending", "running", "completed", "failed"]).default("pending"),
  errorRate: z.number().min(0).max(1).optional().default(0),
});

export type RunCell = z.infer<typeof runCellSchema>;

export const caseResultErrorSchema = z.object({
  code: z
    .enum(["rate_limit", "timeout", "provider_error", "invalid_request", "refusal"])
    .or(z.string()),
  message: z.string(),
  details: z.unknown().optional(),
});

export type CaseResultError = z.infer<typeof caseResultErrorSchema>;

export const caseResultSchema = z.object({
  id: z.string().uuid(),
  runCellId: z.string().uuid(),
  caseId: z.string().length(64),
  repeatIndex: z.number().int().nonnegative(),
  output: z.string().optional().nullable(),
  latencyMs: z.number().nonnegative().optional().nullable(),
  usage: usageSchema.optional().nullable(),
  error: caseResultErrorSchema.optional().nullable(),
  cached: z.boolean().default(false),
  createdAt: z.coerce.date().default(() => new Date()),
});

export type CaseResult = z.infer<typeof caseResultSchema>;

export const runStatusSchema = z.enum(["pending", "running", "completed", "failed", "cancelled"]);

export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().optional().nullable(),
  suiteName: z.string().min(1),
  createdAt: z.coerce.date().default(() => new Date()),
  gitSha: z.string().optional().nullable(),
  configHash: z.string().length(64),
  resolvedConfig: z.record(z.unknown()),
  datasetVersionId: z.string().length(64),
  promptVersionIds: z.array(z.string().length(64)),
  models: z.array(modelConfigSchema),
  graderVersionIds: z.array(z.string().length(64)),
  seeds: z.array(z.number().int()).default([]),
  repeats: z.number().int().positive().default(1),
  usage: usageSchema.default({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costUsd: 0,
    judgeCostUsd: 0,
  }),
  status: runStatusSchema.default("pending"),
  error: z.string().optional().nullable(),
});

export type Run = z.infer<typeof runSchema>;
