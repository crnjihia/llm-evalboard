import type { ComparisonVerdict } from "@evalboard/stats";

export interface ActionInputs {
  config: string;
  githubToken?: string;
  failOnRegression: boolean;
  failOnInconclusive: boolean;
  delta: number;
  repeats?: number;
  baselineRef?: string;
  otelEndpoint?: string;
  langfuseHost?: string;
  langfusePublicKey?: string;
  langfuseSecretKey?: string;
}

export interface ActionOutputs {
  verdict: ComparisonVerdict;
  effectSize: number;
  ciLower: number;
  ciUpper: number;
  passed: boolean;
  reportMarkdown: string;
}

export interface GatingPolicy {
  failOnRegression: boolean;
  failOnInconclusive: boolean;
  delta: number;
}

export interface GatingResult {
  passed: boolean;
  exitCode: number;
  verdict: ComparisonVerdict;
  reason: string;
}

export interface SliceComparisonData {
  tag: string;
  n: number;
  candidateScore: number;
  baselineScore: number;
  meanDifference: number;
  ciLower: number;
  ciUpper: number;
  verdict: ComparisonVerdict;
}

export interface ComparisonSummaryData {
  suiteName: string;
  candidateName: string;
  baselineName: string;
  candidateScore: number;
  baselineScore: number;
  meanDifference: number;
  ciLower: number;
  ciUpper: number;
  confidence: number;
  delta: number;
  verdict: ComparisonVerdict;
  reasoning: string;
  candidateCostUsd?: number;
  baselineCostUsd?: number;
  candidateLatencyMs?: number;
  baselineLatencyMs?: number;
  nPairs: number;
  estimatedAdditionalCases?: number;
  slices?: SliceComparisonData[];
  commitSha?: string;
  prNumber?: number;
}

export interface OtelGenAiSpan {
  traceId: string;
  spanId: string;
  name: string;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Record<string, string | number | boolean>;
}

export interface LangfuseScorePayload {
  name: string;
  value: number;
  comment?: string;
}

export interface LangfuseGenerationPayload {
  name: string;
  model: string;
  modelParameters?: Record<string, unknown>;
  input: unknown;
  output: unknown;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs?: number;
}

export interface LangfuseTracePayload {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  generation?: LangfuseGenerationPayload;
  scores?: LangfuseScorePayload[];
}
