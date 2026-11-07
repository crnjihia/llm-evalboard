import { canonicalJson, hashCanonical, sha256 } from "./canonical.js";

export interface PromptHashInput {
  template: string | Array<{ role: string; content: string }>;
  variablesSchema?: Record<string, unknown> | null;
  messageStructure?: string | null;
}

export function hashPromptContent(input: PromptHashInput): string {
  return hashCanonical({
    template: input.template,
    variablesSchema: input.variablesSchema ?? null,
    messageStructure: input.messageStructure ?? null,
  });
}

export interface CaseHashInput {
  input: Record<string, unknown>;
  expected?: unknown;
  metadata?: Record<string, unknown> | null;
  tags?: string[] | null;
}

export function hashCaseContent(c: CaseHashInput): string {
  return hashCanonical({
    input: c.input,
    expected: c.expected ?? null,
    metadata: c.metadata ?? null,
    tags: c.tags ? [...c.tags].sort() : [],
  });
}

export function hashDatasetVersion(orderedCaseHashes: string[]): string {
  return hashCanonical({
    cases: orderedCaseHashes,
    count: orderedCaseHashes.length,
  });
}

export interface GraderHashInput {
  type: string;
  config: Record<string, unknown>;
  judgePromptText?: string | null;
  judgeModel?: {
    provider: string;
    model: string;
    parameters?: Record<string, unknown> | null;
  } | null;
}

export function hashGraderContent(input: GraderHashInput): string {
  return hashCanonical({
    type: input.type,
    config: input.config,
    judgePromptText: input.judgePromptText ?? null,
    judgeModel: input.judgeModel ?? null,
  });
}

export function hashSuiteConfig(config: unknown): string {
  return hashCanonical(config);
}

export { canonicalJson, hashCanonical, sha256 };
