import {
  bootstrapConfidenceInterval,
  evaluateVerdict,
  mcnemarExactTest,
  mean,
} from "@evalboard/stats";
import { aggregateCellResourceUsage } from "./cost-latency.js";
import { computeTopDisagreements } from "./diff-view.js";
import { evaluateParetoAndRecommend } from "./pareto-advisor.js";
import { analyzeSlices } from "./slices.js";
import { generateExecutiveSummary } from "./summary-generator.js";
import type {
  CaseComparisonData,
  ComparisonOptions,
  ComparisonReport,
  MetricComparison,
} from "./types.js";

export interface CompareCellsInput {
  runId: string;
  baselineCell: { id: string; name: string };
  candidateCell: { id: string; name: string };
  cases: CaseComparisonData[];
  metricNames?: string[];
}

/**
 * Executes statistical comparison between a Baseline cell and a Candidate cell.
 * Produces arm means, paired differences, bootstrap CIs, 4-way verdicts, slices,
 * Simpson's paradox detection, Pareto frontier analysis, and an executive summary.
 */
export function compareCells(
  input: CompareCellsInput,
  options?: ComparisonOptions,
): ComparisonReport {
  const { runId, baselineCell, candidateCell, cases } = input;
  const delta = options?.delta ?? 0.03;
  const confidence = options?.confidence ?? 0.95;
  const seed = options?.seed ?? 42;

  // 1. Evaluate Metrics
  // Default to "Overall Score" and "Pass Rate" if metricNames not provided
  const metricNames = input.metricNames ?? ["Overall Score", "Pass Rate"];
  const metrics: MetricComparison[] = [];

  for (const metricName of metricNames) {
    const isPassRate = metricName.toLowerCase().includes("pass");

    // Per unit of analysis rule: average repeats for each case first
    const baselineCaseScores: number[] = [];
    const candidateCaseScores: number[] = [];
    let bDiscordant = 0; // Baseline pass, candidate fail
    let cDiscordant = 0; // Baseline fail, candidate pass

    for (const c of cases) {
      if (c.baselineRuns.length === 0 || c.candidateRuns.length === 0) continue;

      if (isPassRate) {
        // Fraction of passing runs for this case
        const bPass = c.baselineRuns.filter((r) => r.pass).length / c.baselineRuns.length;
        const cPass = c.candidateRuns.filter((r) => r.pass).length / c.candidateRuns.length;
        baselineCaseScores.push(bPass);
        candidateCaseScores.push(cPass);

        // Binary classification (majority vote for repeats)
        const bMajority = bPass >= 0.5;
        const cMajority = cPass >= 0.5;
        if (bMajority && !cMajority) bDiscordant++;
        if (!bMajority && cMajority) cDiscordant++;
      } else {
        const bScore = mean(c.baselineRuns.map((r) => r.score));
        const cScore = mean(c.candidateRuns.map((r) => r.score));
        baselineCaseScores.push(bScore);
        candidateCaseScores.push(cScore);
      }
    }

    const baselineCi = bootstrapConfidenceInterval(baselineCaseScores, {
      confidence,
      seed,
    });
    const candidateCi = bootstrapConfidenceInterval(candidateCaseScores, {
      confidence,
      seed: seed + 1,
    });

    const verdictResult = evaluateVerdict(baselineCaseScores, candidateCaseScores, {
      delta,
      confidence,
      seed: seed + 2,
    });

    let pValue: number | undefined;
    if (isPassRate && bDiscordant + cDiscordant > 0) {
      pValue = mcnemarExactTest(bDiscordant, cDiscordant).pValue;
    }

    metrics.push({
      metric: metricName,
      baselineMean: baselineCi.pointEstimate,
      baselineCi,
      candidateMean: candidateCi.pointEstimate,
      candidateCi,
      diff: verdictResult.d,
      ci: verdictResult.ci,
      verdict: verdictResult.verdict,
      pValue,
      delta,
      nPairs: verdictResult.nPairs,
      excludedPairs: verdictResult.excludedPairs,
      reasoning: verdictResult.reasoning,
      estimatedAdditionalCases: verdictResult.estimatedAdditionalCases,
    });
  }

  // 2. Resource usage
  const baselineUsage = aggregateCellResourceUsage(
    baselineCell.id,
    baselineCell.name,
    cases,
    "baseline",
  );
  const candidateUsage = aggregateCellResourceUsage(
    candidateCell.id,
    candidateCell.name,
    cases,
    "candidate",
  );

  // 3. Slices & Simpson's Paradox Guard
  const primaryMetric = metrics[0];
  const primaryDiff = primaryMetric?.diff ?? 0;
  const { slices, simpsonsAnomalies } = analyzeSlices(cases, primaryDiff, options);

  // 4. Per-case top disagreements
  const topDisagreements = computeTopDisagreements(cases, options?.maxDisagreements ?? 10);

  // 5. Pareto frontier and recommendation
  const paretoCells = [
    {
      cellId: baselineCell.id,
      cellName: baselineCell.name,
      costUsd: baselineUsage.totalCostUsd,
      latencyP95Ms: baselineUsage.latencyP95Ms,
      qualityCi: primaryMetric?.baselineCi ?? {
        pointEstimate: 0,
        lower: 0,
        upper: 0,
        confidence,
      },
    },
    {
      cellId: candidateCell.id,
      cellName: candidateCell.name,
      costUsd: candidateUsage.totalCostUsd,
      latencyP95Ms: candidateUsage.latencyP95Ms,
      qualityCi: primaryMetric?.candidateCi ?? {
        pointEstimate: 0,
        lower: 0,
        upper: 0,
        confidence,
      },
    },
  ];

  const pareto = evaluateParetoAndRecommend(paretoCells, {
    delta,
    qualityMetric: primaryMetric?.metric ?? "Overall Score",
  });

  // 6. Deterministic executive summary generator
  const executiveSummary = generateExecutiveSummary({
    baselineName: baselineCell.name,
    candidateName: candidateCell.name,
    metrics,
    usage: {
      baseline: baselineUsage,
      candidate: candidateUsage,
    },
    simpsonsAnomalies,
  });

  return {
    runId,
    baselineCell,
    candidateCell,
    metrics,
    slices,
    simpsonsAnomalies,
    topDisagreements,
    usage: {
      baseline: baselineUsage,
      candidate: candidateUsage,
    },
    pareto,
    executiveSummary,
  };
}

/**
 * Minimal interface for saving comparisons to DB without hard-coupling to repositories package.
 */
export interface ComparisonSaver {
  saveComparison(input: {
    runId: string;
    baselineCellId: string;
    candidateCellId: string;
    metric: string;
    baselineMean: number;
    candidateMean: number;
    diff: number;
    ciLower: number;
    ciUpper: number;
    confidenceLevel?: number;
    delta?: number;
    verdict: string;
    pValue?: number;
    nPairs: number;
    excludedPairs?: number;
    reasoning?: string;
    seed?: number;
  }): Promise<unknown>;
}

/**
 * Persists all evaluated metric comparisons from a ComparisonReport into the database.
 */
export async function persistComparisons(
  saver: ComparisonSaver,
  report: ComparisonReport,
  seed?: number,
): Promise<void> {
  for (const m of report.metrics) {
    await saver.saveComparison({
      runId: report.runId,
      baselineCellId: report.baselineCell.id,
      candidateCellId: report.candidateCell.id,
      metric: m.metric,
      baselineMean: m.baselineMean,
      candidateMean: m.candidateMean,
      diff: m.diff,
      ciLower: m.ci.lower,
      ciUpper: m.ci.upper,
      confidenceLevel: m.ci.confidence,
      delta: m.delta,
      verdict: m.verdict,
      pValue: m.pValue,
      nPairs: m.nPairs,
      excludedPairs: m.excludedPairs,
      reasoning: m.reasoning,
      seed,
    });
  }
}
