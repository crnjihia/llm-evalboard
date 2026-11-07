import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Phase 0 health check table
export const systemHealth = pgTable("system_health", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});

// Projects
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Prompts
export const prompts = pgTable(
  "prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("prompts_project_idx").on(table.projectId),
    index("prompts_name_idx").on(table.name),
  ],
);

// Content-addressed immutable prompt versions
export const promptVersions = pgTable(
  "prompt_versions",
  {
    // sha256(canonical JSON of template + variablesSchema + messageStructure)
    id: text("id").primaryKey(),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => prompts.id, { onDelete: "cascade" }),
    template: jsonb("template").notNull(),
    variablesSchema: jsonb("variables_schema"),
    messageStructure: text("message_structure"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("prompt_versions_prompt_idx").on(table.promptId)],
);

// Datasets
export const datasets = pgTable(
  "datasets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("datasets_project_idx").on(table.projectId),
    index("datasets_name_idx").on(table.name),
  ],
);

// Content-addressed immutable dataset versions
export const datasetVersions = pgTable(
  "dataset_versions",
  {
    // sha256(canonical JSON of ordered case hashes)
    id: text("id").primaryKey(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => datasets.id, { onDelete: "cascade" }),
    caseCount: integer("case_count").notNull(),
    caseHashes: jsonb("case_hashes").notNull(), // string[]
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("dataset_versions_dataset_idx").on(table.datasetId)],
);

// Cases
export const cases = pgTable(
  "cases",
  {
    // sha256(canonical JSON of case content)
    id: text("id").notNull(),
    datasetVersionId: text("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id, { onDelete: "cascade" }),
    caseIndex: integer("case_index").notNull(),
    input: jsonb("input").notNull(),
    expected: jsonb("expected"),
    metadata: jsonb("metadata"),
    tags: jsonb("tags").notNull().default([]), // string[]
    split: text("split").notNull().default("test"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.datasetVersionId, table.id] }),
    index("cases_dataset_version_idx").on(table.datasetVersionId),
    index("cases_split_idx").on(table.split),
  ],
);

// Content-addressed immutable grader versions
export const graderVersions = pgTable(
  "grader_versions",
  {
    // sha256(canonical JSON of type + config + judgePromptText + judgeModel)
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    name: text("name"),
    config: jsonb("config").notNull().default({}),
    judgePromptText: text("judge_prompt_text"),
    judgeModel: jsonb("judge_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("grader_versions_type_idx").on(table.type)],
);

// Evaluation runs
export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    suiteName: text("suite_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    gitSha: text("git_sha"),
    configHash: text("config_hash").notNull(),
    resolvedConfig: jsonb("resolved_config").notNull(),
    datasetVersionId: text("dataset_version_id")
      .notNull()
      .references(() => datasetVersions.id),
    promptVersionIds: jsonb("prompt_version_ids").notNull(), // string[]
    models: jsonb("models").notNull(), // ModelConfig[]
    graderVersionIds: jsonb("grader_version_ids").notNull(), // string[]
    seeds: jsonb("seeds").notNull().default([]), // number[]
    repeats: integer("repeats").notNull().default(1),
    usage: jsonb("usage").notNull(), // Usage
    status: text("status").notNull().default("pending"),
    error: text("error"),
  },
  (table) => [
    index("runs_project_idx").on(table.projectId),
    index("runs_suite_name_idx").on(table.suiteName),
    index("runs_status_idx").on(table.status),
    index("runs_created_at_idx").on(table.createdAt),
  ],
);

// Run arms / cells (prompt × model)
export const runCells = pgTable(
  "run_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    promptVersionId: text("prompt_version_id")
      .notNull()
      .references(() => promptVersions.id),
    modelConfig: jsonb("model_config").notNull(),
    isBaseline: boolean("is_baseline").notNull().default(false),
    status: text("status").notNull().default("pending"),
    errorRate: doublePrecision("error_rate").notNull().default(0),
  },
  (table) => [
    index("run_cells_run_idx").on(table.runId),
    index("run_cells_prompt_version_idx").on(table.promptVersionId),
  ],
);

// Individual case execution result (case × repeat)
export const caseResults = pgTable(
  "case_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runCellId: uuid("run_cell_id")
      .notNull()
      .references(() => runCells.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    repeatIndex: integer("repeat_index").notNull().default(0),
    output: text("output"),
    latencyMs: integer("latency_ms"),
    usage: jsonb("usage"),
    error: jsonb("error"),
    cached: boolean("cached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("case_results_cell_idx").on(table.runCellId),
    index("case_results_case_idx").on(table.caseId),
    uniqueIndex("case_results_cell_case_repeat_idx").on(
      table.runCellId,
      table.caseId,
      table.repeatIndex,
    ),
  ],
);

// Grader results per case result
export const graderResults = pgTable(
  "grader_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseResultId: uuid("case_result_id")
      .notNull()
      .references(() => caseResults.id, { onDelete: "cascade" }),
    graderVersionId: text("grader_version_id")
      .notNull()
      .references(() => graderVersions.id),
    score: doublePrecision("score").notNull(), // [0, 1]
    pass: boolean("pass").notNull(),
    reason: text("reason").notNull(),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("grader_results_case_result_idx").on(table.caseResultId),
    index("grader_results_grader_version_idx").on(table.graderVersionId),
  ],
);

// Comparisons & verdicts (Phase 8)
export const comparisons = pgTable(
  "comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    baselineCellId: uuid("baseline_cell_id")
      .notNull()
      .references(() => runCells.id),
    candidateCellId: uuid("candidate_cell_id")
      .notNull()
      .references(() => runCells.id),
    metric: text("metric").notNull(),
    baselineMean: doublePrecision("baseline_mean").notNull(),
    candidateMean: doublePrecision("candidate_mean").notNull(),
    diff: doublePrecision("diff").notNull(), // candidate - baseline
    ciLower: doublePrecision("ci_lower").notNull(),
    ciUpper: doublePrecision("ci_upper").notNull(),
    confidenceLevel: doublePrecision("confidence_level").notNull().default(0.95),
    delta: doublePrecision("delta").notNull().default(0.03),
    verdict: text("verdict").notNull(), // BETTER, WORSE, NO_MEANINGFUL_DIFFERENCE, INCONCLUSIVE
    pValue: doublePrecision("p_value"),
    nPairs: integer("n_pairs").notNull(),
    excludedPairs: integer("excluded_pairs").notNull().default(0),
    reasoning: text("reasoning"),
    seed: integer("seed"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("comparisons_run_idx").on(table.runId),
    index("comparisons_verdict_idx").on(table.verdict),
  ],
);

// Production traces (Phase 10)
export const traces = pgTable(
  "traces",
  {
    id: text("id").primaryKey(), // traceId
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow().notNull(),
    input: jsonb("input").notNull(),
    output: text("output").notNull(),
    model: text("model").notNull(),
    metadata: jsonb("metadata"),
    feedback: jsonb("feedback"),
    redacted: boolean("redacted").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("traces_project_idx").on(table.projectId),
    index("traces_timestamp_idx").on(table.timestamp),
  ],
);

// Trace triage labels (Phase 10)
export const traceLabels = pgTable(
  "trace_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    traceId: text("trace_id")
      .notNull()
      .references(() => traces.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    score: doublePrecision("score"),
    details: jsonb("details"),
    labeledBy: text("labeled_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("trace_labels_trace_idx").on(table.traceId)],
);

// Red-team runs (Phase 11)
export const redteamRuns = pgTable(
  "redteam_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    targetPromptVersionId: text("target_prompt_version_id").references(() => promptVersions.id),
    modelConfig: jsonb("model_config").notNull(),
    asr: doublePrecision("asr").notNull(), // Attack Success Rate in [0, 1]
    ciLower: doublePrecision("ci_lower").notNull(),
    ciUpper: doublePrecision("ci_upper").notNull(),
    totalAttacks: integer("total_attacks").notNull(),
    successfulAttacks: integer("successful_attacks").notNull(),
    categoryBreakdown: jsonb("category_breakdown").notNull(),
    overRefusalRate: doublePrecision("over_refusal_rate"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("redteam_runs_project_idx").on(table.projectId)],
);

// Schedules (Phase 14)
export const schedules = pgTable(
  "schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    suiteName: text("suite_name").notNull(),
    cronExpression: text("cron_expression").notNull(),
    maxCostUsd: doublePrecision("max_cost_usd"),
    active: boolean("active").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("schedules_project_idx").on(table.projectId)],
);

// Regression alerts (Phase 14)
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    scheduleId: uuid("schedule_id").references(() => schedules.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => runs.id, { onDelete: "cascade" }),
    severity: text("severity").notNull(), // info, warning, critical
    type: text("type").notNull(), // regression, silent_change, cost_spike
    message: text("message").notNull(),
    details: jsonb("details"),
    status: text("status").notNull().default("open"), // open, acknowledged, snoozed, resolved
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("alerts_project_idx").on(table.projectId),
    index("alerts_status_idx").on(table.status),
  ],
);

// Human labels for judge calibration (Phase 6)
export const humanLabels = pgTable(
  "human_labels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseResultId: uuid("case_result_id")
      .notNull()
      .references(() => caseResults.id, { onDelete: "cascade" }),
    graderVersionId: text("grader_version_id").references(() => graderVersions.id),
    criterion: text("criterion").notNull(),
    label: text("label").notNull(),
    score: doublePrecision("score"),
    notes: text("notes"),
    labeledBy: text("labeled_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("human_labels_case_result_idx").on(table.caseResultId),
    index("human_labels_grader_version_idx").on(table.graderVersionId),
  ],
);
