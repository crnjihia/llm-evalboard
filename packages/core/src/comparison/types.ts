import type {
  ComparisonVerdict,
  ConfidenceIntervalResult,
  EvaluatedParetoPoint,
} from "@evalboard/stats";

export interface CaseComparisonData {
  caseId: string;
  input: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: string[];
  baselineRuns: Array<{
    score: number;
    pass: boolean;
    output?: string;
    reason?: string;
    latencyMs?: number;
    costUsd?: number;
    judgeCostUsd?: number;
    tokens?: { prompt: number; completion: number; total: number };
  }>;
  candidateRuns: Array<{
    score: number;
    pass: boolean;
    output?: string;
    reason?: string;
    latencyMs?: number;
    costUsd?: number;
    judgeCostUsd?: number;
    tokens?: { prompt: number; completion: number; total: number };
  }>;
}

export interface MetricComparison {
  metric: string;
  baselineMean: number;
  baselineCi: ConfidenceIntervalResult;
  candidateMean: number;
  candidateCi: ConfidenceIntervalResult;
  diff: number; // Candidate - Baseline
  ci: ConfidenceIntervalResult; // CI of the paired difference
  verdict: ComparisonVerdict;
  pValue?: number; // McNemar exact p-value for binary metrics or paired test
  delta: number;
  nPairs: number;
  excludedPairs: number;
  reasoning: string;
  estimatedAdditionalCases?: number;
}

export interface SliceResult {
  sliceKey: string;
  sliceValue: string;
  sampleSize: number;
  isSmallSample: boolean;
  warning?: string;
  baselineMean: number;
  candidateMean: number;
  diff: number;
  ci: ConfidenceIntervalResult;
  verdict: ComparisonVerdict;
  isSimpsonsAnomaly: boolean;
  simpsonsReasoning?: string;
}

export interface PerCaseDisagreement {
  caseId: string;
  input: Record<string, unknown>;
  baselineScore: number;
  candidateScore: number;
  absoluteDiff: number;
  baselineOutput?: string;
  candidateOutput?: string;
  baselineReason?: string;
  candidateReason?: string;
  baselineCostUsd: number;
  candidateCostUsd: number;
  baselineLatencyMs: number;
  candidateLatencyMs: number;
}

export interface CellResourceUsage {
  cellId: string;
  cellName: string;
  generationCostUsd: number;
  judgeCostUsd: number;
  totalCostUsd: number;
  costPer1kCasesUsd: number;
  latencyMeanMs: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface ParetoRecommendation {
  recommendedCellId: string;
  recommendedCellName: string;
  ruleExplanation: string;
  caveats: string[];
}

export interface ParetoComparisonData {
  qualityMetric: string;
  points: EvaluatedParetoPoint[];
  frontier: EvaluatedParetoPoint[];
  uncertain: EvaluatedParetoPoint[];
  dominated: EvaluatedParetoPoint[];
  recommendation: ParetoRecommendation;
}

export interface ComparisonReport {
  runId: string;
  baselineCell: { id: string; name: string };
  candidateCell: { id: string; name: string };
  metrics: MetricComparison[];
  slices: SliceResult[];
  simpsonsAnomalies: SliceResult[];
  topDisagreements: PerCaseDisagreement[];
  usage: {
    baseline: CellResourceUsage;
    candidate: CellResourceUsage;
  };
  pareto: ParetoComparisonData;
  executiveSummary: string;
}

export interface ComparisonOptions {
  delta?: number;
  confidence?: number;
  seed?: number;
  resamples?: number;
  minSliceSize?: number;
  maxDisagreements?: number;
}
