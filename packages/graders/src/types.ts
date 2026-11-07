export interface GradeCaseInput {
  id?: string;
  input: Record<string, unknown>;
  expected?: unknown;
  tags?: string[];
  metadata?: Record<string, unknown> | null;
}

export interface GradeInput {
  case: GradeCaseInput;
  output: string;
  context?: Record<string, unknown>;
}

export interface GraderOutcome {
  score: number; // in [0, 1]
  pass: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

export interface Grader<TConfig = Record<string, unknown>> {
  readonly type: string;
  readonly versionId: string;
  readonly config: TConfig;
  grade(input: GradeInput): Promise<GraderOutcome> | GraderOutcome;
}

export type ExtractorType =
  | "strip_code_fences"
  | "extract_json"
  | "after_delimiter"
  | "regex_capture";

export interface ExtractorConfig {
  type: ExtractorType;
  options?: Record<string, unknown>;
}
