CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"schedule_id" uuid,
	"run_id" uuid,
	"severity" text NOT NULL,
	"type" text NOT NULL,
	"message" text NOT NULL,
	"details" jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_cell_id" uuid NOT NULL,
	"case_id" text NOT NULL,
	"repeat_index" integer DEFAULT 0 NOT NULL,
	"output" text,
	"latency_ms" integer,
	"usage" jsonb,
	"error" jsonb,
	"cached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text NOT NULL,
	"dataset_version_id" text NOT NULL,
	"case_index" integer NOT NULL,
	"input" jsonb NOT NULL,
	"expected" jsonb,
	"metadata" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"split" text DEFAULT 'test' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cases_dataset_version_id_id_pk" PRIMARY KEY("dataset_version_id","id")
);
--> statement-breakpoint
CREATE TABLE "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"baseline_cell_id" uuid NOT NULL,
	"candidate_cell_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"baseline_mean" double precision NOT NULL,
	"candidate_mean" double precision NOT NULL,
	"diff" double precision NOT NULL,
	"ci_lower" double precision NOT NULL,
	"ci_upper" double precision NOT NULL,
	"confidence_level" double precision DEFAULT 0.95 NOT NULL,
	"delta" double precision DEFAULT 0.03 NOT NULL,
	"verdict" text NOT NULL,
	"p_value" double precision,
	"n_pairs" integer NOT NULL,
	"excluded_pairs" integer DEFAULT 0 NOT NULL,
	"reasoning" text,
	"seed" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dataset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" uuid NOT NULL,
	"case_count" integer NOT NULL,
	"case_hashes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grader_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_result_id" uuid NOT NULL,
	"grader_version_id" text NOT NULL,
	"score" double precision NOT NULL,
	"pass" boolean NOT NULL,
	"reason" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grader_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"name" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"judge_prompt_text" text,
	"judge_model" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "human_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_result_id" uuid NOT NULL,
	"grader_version_id" text,
	"criterion" text NOT NULL,
	"label" text NOT NULL,
	"score" double precision,
	"notes" text,
	"labeled_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt_id" uuid NOT NULL,
	"template" jsonb NOT NULL,
	"variables_schema" jsonb,
	"message_structure" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redteam_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"target_prompt_version_id" text,
	"model_config" jsonb NOT NULL,
	"asr" double precision NOT NULL,
	"ci_lower" double precision NOT NULL,
	"ci_upper" double precision NOT NULL,
	"total_attacks" integer NOT NULL,
	"successful_attacks" integer NOT NULL,
	"category_breakdown" jsonb NOT NULL,
	"over_refusal_rate" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"prompt_version_id" text NOT NULL,
	"model_config" jsonb NOT NULL,
	"is_baseline" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_rate" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"suite_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"git_sha" text,
	"config_hash" text NOT NULL,
	"resolved_config" jsonb NOT NULL,
	"dataset_version_id" text NOT NULL,
	"prompt_version_ids" jsonb NOT NULL,
	"models" jsonb NOT NULL,
	"grader_version_ids" jsonb NOT NULL,
	"seeds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repeats" integer DEFAULT 1 NOT NULL,
	"usage" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"suite_name" text NOT NULL,
	"cron_expression" text NOT NULL,
	"max_cost_usd" double precision,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trace_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" text NOT NULL,
	"label" text NOT NULL,
	"score" double precision,
	"details" jsonb,
	"labeled_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traces" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"input" jsonb NOT NULL,
	"output" text NOT NULL,
	"model" text NOT NULL,
	"metadata" jsonb,
	"feedback" jsonb,
	"redacted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_schedule_id_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_results" ADD CONSTRAINT "case_results_run_cell_id_run_cells_id_fk" FOREIGN KEY ("run_cell_id") REFERENCES "public"."run_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_baseline_cell_id_run_cells_id_fk" FOREIGN KEY ("baseline_cell_id") REFERENCES "public"."run_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_candidate_cell_id_run_cells_id_fk" FOREIGN KEY ("candidate_cell_id") REFERENCES "public"."run_cells"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_versions" ADD CONSTRAINT "dataset_versions_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grader_results" ADD CONSTRAINT "grader_results_case_result_id_case_results_id_fk" FOREIGN KEY ("case_result_id") REFERENCES "public"."case_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grader_results" ADD CONSTRAINT "grader_results_grader_version_id_grader_versions_id_fk" FOREIGN KEY ("grader_version_id") REFERENCES "public"."grader_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_labels" ADD CONSTRAINT "human_labels_case_result_id_case_results_id_fk" FOREIGN KEY ("case_result_id") REFERENCES "public"."case_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "human_labels" ADD CONSTRAINT "human_labels_grader_version_id_grader_versions_id_fk" FOREIGN KEY ("grader_version_id") REFERENCES "public"."grader_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_versions" ADD CONSTRAINT "prompt_versions_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompts" ADD CONSTRAINT "prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redteam_runs" ADD CONSTRAINT "redteam_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redteam_runs" ADD CONSTRAINT "redteam_runs_target_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("target_prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_cells" ADD CONSTRAINT "run_cells_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_cells" ADD CONSTRAINT "run_cells_prompt_version_id_prompt_versions_id_fk" FOREIGN KEY ("prompt_version_id") REFERENCES "public"."prompt_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_dataset_version_id_dataset_versions_id_fk" FOREIGN KEY ("dataset_version_id") REFERENCES "public"."dataset_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_labels" ADD CONSTRAINT "trace_labels_trace_id_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."traces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traces" ADD CONSTRAINT "traces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_project_idx" ON "alerts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "case_results_cell_idx" ON "case_results" USING btree ("run_cell_id");--> statement-breakpoint
CREATE INDEX "case_results_case_idx" ON "case_results" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "case_results_cell_case_repeat_idx" ON "case_results" USING btree ("run_cell_id","case_id","repeat_index");--> statement-breakpoint
CREATE INDEX "cases_dataset_version_idx" ON "cases" USING btree ("dataset_version_id");--> statement-breakpoint
CREATE INDEX "cases_split_idx" ON "cases" USING btree ("split");--> statement-breakpoint
CREATE INDEX "comparisons_run_idx" ON "comparisons" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "comparisons_verdict_idx" ON "comparisons" USING btree ("verdict");--> statement-breakpoint
CREATE INDEX "dataset_versions_dataset_idx" ON "dataset_versions" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "datasets_project_idx" ON "datasets" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "datasets_name_idx" ON "datasets" USING btree ("name");--> statement-breakpoint
CREATE INDEX "grader_results_case_result_idx" ON "grader_results" USING btree ("case_result_id");--> statement-breakpoint
CREATE INDEX "grader_results_grader_version_idx" ON "grader_results" USING btree ("grader_version_id");--> statement-breakpoint
CREATE INDEX "grader_versions_type_idx" ON "grader_versions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "human_labels_case_result_idx" ON "human_labels" USING btree ("case_result_id");--> statement-breakpoint
CREATE INDEX "human_labels_grader_version_idx" ON "human_labels" USING btree ("grader_version_id");--> statement-breakpoint
CREATE INDEX "prompt_versions_prompt_idx" ON "prompt_versions" USING btree ("prompt_id");--> statement-breakpoint
CREATE INDEX "prompts_project_idx" ON "prompts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "prompts_name_idx" ON "prompts" USING btree ("name");--> statement-breakpoint
CREATE INDEX "redteam_runs_project_idx" ON "redteam_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "run_cells_run_idx" ON "run_cells" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "run_cells_prompt_version_idx" ON "run_cells" USING btree ("prompt_version_id");--> statement-breakpoint
CREATE INDEX "runs_project_idx" ON "runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "runs_suite_name_idx" ON "runs" USING btree ("suite_name");--> statement-breakpoint
CREATE INDEX "runs_status_idx" ON "runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "runs_created_at_idx" ON "runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "schedules_project_idx" ON "schedules" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "trace_labels_trace_idx" ON "trace_labels" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "traces_project_idx" ON "traces" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "traces_timestamp_idx" ON "traces" USING btree ("timestamp");