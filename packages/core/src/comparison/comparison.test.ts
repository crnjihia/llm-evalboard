import { describe, expect, it } from "vitest";
import {
  aggregateCellResourceUsage,
  analyzeSlices,
  compareCells,
  computeTopDisagreements,
  evaluateParetoAndRecommend,
  generateExecutiveSummary,
} from "./index.js";
import type { CaseComparisonData, MetricComparison } from "./types.js";

describe("Phase 8: Executive Summary Generator Snapshot Tests", () => {
  it("formats BETTER verdict correctly", () => {
    const metrics: MetricComparison[] = [
      {
        metric: "JSON Validity",
        baselineMean: 0.85,
        baselineCi: { pointEstimate: 0.85, lower: 0.82, upper: 0.88, confidence: 0.95 },
        candidateMean: 0.95,
        candidateCi: { pointEstimate: 0.95, lower: 0.92, upper: 0.97, confidence: 0.95 },
        diff: 0.1,
        ci: { pointEstimate: 0.1, lower: 0.06, upper: 0.14, confidence: 0.95 },
        verdict: "BETTER",
        delta: 0.03,
        nPairs: 50,
        excludedPairs: 0,
        reasoning: "Candidate reliably outperforms baseline",
      },
    ];

    const summary = generateExecutiveSummary({
      baselineName: "Prompt v1",
      candidateName: "Prompt v2",
      metrics,
    });

    expect(summary).toMatchInlineSnapshot(
      `"Prompt v2 is better than Prompt v1 on JSON Validity (+10.0 pts, 95% CI [6.0, 14.0], δ = 3.0 pts)."`,
    );
  });

  it("formats WORSE verdict correctly", () => {
    const metrics: MetricComparison[] = [
      {
        metric: "Safety Refusal",
        baselineMean: 0.92,
        baselineCi: { pointEstimate: 0.92, lower: 0.89, upper: 0.95, confidence: 0.95 },
        candidateMean: 0.82,
        candidateCi: { pointEstimate: 0.82, lower: 0.78, upper: 0.86, confidence: 0.95 },
        diff: -0.1,
        ci: { pointEstimate: -0.1, lower: -0.15, upper: -0.05, confidence: 0.95 },
        verdict: "WORSE",
        delta: 0.03,
        nPairs: 50,
        excludedPairs: 0,
        reasoning: "Candidate reliably degrades performance",
      },
    ];

    const summary = generateExecutiveSummary({
      baselineName: "Baseline Model",
      candidateName: "Candidate Model",
      metrics,
    });

    expect(summary).toMatchInlineSnapshot(
      `"Candidate Model is worse than Baseline Model on Safety Refusal (-10.0 pts, 95% CI [-15.0, -5.0], δ = 3.0 pts)."`,
    );
  });

  it("formats NO MEANINGFUL DIFFERENCE verdict correctly", () => {
    const metrics: MetricComparison[] = [
      {
        metric: "Helpfulness",
        baselineMean: 0.88,
        baselineCi: { pointEstimate: 0.88, lower: 0.85, upper: 0.91, confidence: 0.95 },
        candidateMean: 0.884,
        candidateCi: { pointEstimate: 0.884, lower: 0.86, upper: 0.91, confidence: 0.95 },
        diff: 0.004,
        ci: { pointEstimate: 0.004, lower: -0.021, upper: 0.029, confidence: 0.95 },
        verdict: "NO MEANINGFUL DIFFERENCE",
        delta: 0.03,
        nPairs: 60,
        excludedPairs: 0,
        reasoning: "Practically equivalent within bounds",
      },
    ];

    const summary = generateExecutiveSummary({
      baselineName: "Prompt v1",
      candidateName: "Prompt v2",
      metrics,
    });

    expect(summary).toMatchInlineSnapshot(
      `"Prompt v2 shows no meaningful difference compared to Prompt v1 on Helpfulness (+0.4 pts, 95% CI [-2.1, 2.9], δ = 3.0 pts)."`,
    );
  });

  it("formats INCONCLUSIVE verdict with required additional cases estimate", () => {
    const metrics: MetricComparison[] = [
      {
        metric: "Accuracy",
        baselineMean: 0.75,
        baselineCi: { pointEstimate: 0.75, lower: 0.65, upper: 0.85, confidence: 0.95 },
        candidateMean: 0.78,
        candidateCi: { pointEstimate: 0.78, lower: 0.68, upper: 0.87, confidence: 0.95 },
        diff: 0.03,
        ci: { pointEstimate: 0.03, lower: -0.06, upper: 0.12, confidence: 0.95 },
        verdict: "INCONCLUSIVE",
        delta: 0.03,
        nPairs: 20,
        excludedPairs: 0,
        reasoning: "Confidence interval too wide",
        estimatedAdditionalCases: 145,
      },
    ];

    const summary = generateExecutiveSummary({
      baselineName: "Old Model",
      candidateName: "New Model",
      metrics,
    });

    expect(summary).toMatchInlineSnapshot(
      `"New Model vs Old Model on Accuracy is inconclusive (+3.0 pts, 95% CI [-6.0, 12.0], δ = 3.0 pts; estimated 145 more cases needed)."`,
    );
  });

  it("formats multi-metric comparison with cost savings and latency", () => {
    const metrics: MetricComparison[] = [
      {
        metric: "JSON validity",
        baselineMean: 0.85,
        baselineCi: { pointEstimate: 0.85, lower: 0.82, upper: 0.88, confidence: 0.95 },
        candidateMean: 0.911,
        candidateCi: { pointEstimate: 0.911, lower: 0.88, upper: 0.94, confidence: 0.95 },
        diff: 0.061,
        ci: { pointEstimate: 0.061, lower: 0.032, upper: 0.09, confidence: 0.95 },
        verdict: "BETTER",
        delta: 0.03,
        nPairs: 100,
        excludedPairs: 0,
        reasoning: "Statistically better",
      },
      {
        metric: "Helpfulness",
        baselineMean: 0.88,
        baselineCi: { pointEstimate: 0.88, lower: 0.85, upper: 0.91, confidence: 0.95 },
        candidateMean: 0.884,
        candidateCi: { pointEstimate: 0.884, lower: 0.85, upper: 0.91, confidence: 0.95 },
        diff: 0.004,
        ci: { pointEstimate: 0.004, lower: -0.021, upper: 0.029, confidence: 0.95 },
        verdict: "NO MEANINGFUL DIFFERENCE",
        delta: 0.03,
        nPairs: 100,
        excludedPairs: 0,
        reasoning: "Practically equivalent",
      },
    ];

    const usage = {
      baseline: {
        cellId: "base",
        cellName: "v1",
        generationCostUsd: 0.1,
        judgeCostUsd: 0.05,
        totalCostUsd: 0.15,
        costPer1kCasesUsd: 1.5,
        latencyMeanMs: 450,
        latencyP50Ms: 400,
        latencyP95Ms: 650,
        tokens: { prompt: 1000, completion: 500, total: 1500 },
      },
      candidate: {
        cellId: "cand",
        cellName: "v2",
        generationCostUsd: 0.06,
        judgeCostUsd: 0.03,
        totalCostUsd: 0.09,
        costPer1kCasesUsd: 0.89,
        latencyMeanMs: 250,
        latencyP50Ms: 220,
        latencyP95Ms: 380,
        tokens: { prompt: 800, completion: 400, total: 1200 },
      },
    };

    const summary = generateExecutiveSummary({
      baselineName: "Prompt v1",
      candidateName: "Prompt v2",
      metrics,
      usage,
    });

    expect(summary).toMatchInlineSnapshot(
      `"Prompt v2 is better than Prompt v1 on JSON validity (+6.1 pts, 95% CI [3.2, 9.0], δ = 3.0 pts) and Prompt v2 shows no meaningful difference compared to Prompt v1 on Helpfulness (+0.4 pts, 95% CI [-2.1, 2.9], δ = 3.0 pts). Prompt v2 costs 41% less ($0.89 vs $1.50 per 1k cases) with a p95 latency of 380ms."`,
    );
  });
});

describe("Phase 8: Slice Analysis & Planted Simpson's Paradox", () => {
  it("flags a planted Simpson's-paradox fixture where aggregated gain hides subgroup regression", () => {
    // 25 general cases: Candidate outperforms baseline (+0.25)
    // 15 financial cases: Candidate severely degrades performance (-0.20)
    // Overall difference will be positive (+0.08), but the financial slice reverses direction
    const cases: CaseComparisonData[] = [];

    // General subgroup (25 cases)
    for (let i = 0; i < 25; i++) {
      cases.push({
        caseId: `case-gen-${i}`,
        input: { text: `General case query number ${i}` },
        tags: ["general"],
        metadata: { category: "general" },
        baselineRuns: [{ score: 0.7, pass: true, latencyMs: 200, costUsd: 0.001 }],
        candidateRuns: [{ score: 0.95, pass: true, latencyMs: 210, costUsd: 0.001 }],
      });
    }

    // Financial subgroup (15 cases)
    for (let i = 0; i < 15; i++) {
      cases.push({
        caseId: `case-fin-${i}`,
        input: { text: `Financial query audit number ${i}` },
        tags: ["finance"],
        metadata: { category: "finance" },
        baselineRuns: [{ score: 0.9, pass: true, latencyMs: 300, costUsd: 0.002 }],
        candidateRuns: [{ score: 0.7, pass: false, latencyMs: 310, costUsd: 0.002 }],
      });
    }

    // Overall mean: Baseline = (25*0.7 + 15*0.9)/40 = 31/40 = 0.775
    // Overall mean: Candidate = (25*0.95 + 15*0.7)/40 = 34.25/40 = 0.85625
    // Overall difference is ~ +0.081 (Clear improvement overall)
    const overallDiff = 0.85625 - 0.775;
    expect(overallDiff).toBeGreaterThan(0.05);

    const { slices, simpsonsAnomalies } = analyzeSlices(cases, overallDiff, {
      minSliceSize: 10,
      delta: 0.03,
    });

    expect(simpsonsAnomalies.length).toBeGreaterThan(0);
    const financeAnomaly = simpsonsAnomalies.find(
      (s) => s.sliceKey === "category" && s.sliceValue === "finance",
    );
    expect(financeAnomaly).toBeDefined();
    expect(financeAnomaly?.isSimpsonsAnomaly).toBe(true);
    expect(financeAnomaly?.diff).toBeCloseTo(-0.2, 2);
    expect(financeAnomaly?.simpsonsReasoning).toContain("Simpson's paradox detected");

    // General slice is not an anomaly
    const generalSlice = slices.find((s) => s.sliceValue === "general");
    expect(generalSlice?.isSimpsonsAnomaly).toBe(false);

    // Verify executive summary surfaces the Simpson's alert
    const summary = generateExecutiveSummary({
      baselineName: "Baseline",
      candidateName: "Candidate",
      metrics: [
        {
          metric: "Quality",
          baselineMean: 0.775,
          baselineCi: { pointEstimate: 0.775, lower: 0.74, upper: 0.81, confidence: 0.95 },
          candidateMean: 0.856,
          candidateCi: { pointEstimate: 0.856, lower: 0.82, upper: 0.89, confidence: 0.95 },
          diff: overallDiff,
          ci: { pointEstimate: overallDiff, lower: 0.04, upper: 0.12, confidence: 0.95 },
          verdict: "BETTER",
          delta: 0.03,
          nPairs: 40,
          excludedPairs: 0,
          reasoning: "Overall improved",
        },
      ],
      simpsonsAnomalies,
    });

    expect(summary).toContain("Caution: Simpson's paradox detected in slice");
  });

  it("attaches small-sample warnings to slices with n < minSliceSize", () => {
    const cases: CaseComparisonData[] = [];
    for (let i = 0; i < 5; i++) {
      cases.push({
        caseId: `rare-${i}`,
        input: { q: `Rare item ${i}` },
        tags: ["rare_intent"],
        baselineRuns: [{ score: 0.8, pass: true }],
        candidateRuns: [{ score: 0.85, pass: true }],
      });
    }

    const { slices } = analyzeSlices(cases, 0.05, { minSliceSize: 10 });
    const rareSlice = slices.find((s) => s.sliceValue === "rare_intent");
    expect(rareSlice?.isSmallSample).toBe(true);
    expect(rareSlice?.warning).toContain("n too small");
  });
});

describe("Phase 8: Comparison Engine Reproducibility & Pareto", () => {
  it("produces identical reproducible results from stored records given same seed", () => {
    const cases: CaseComparisonData[] = [
      {
        caseId: "c1",
        input: { p: "Q1" },
        baselineRuns: [{ score: 0.8, pass: true, latencyMs: 150, costUsd: 0.001 }],
        candidateRuns: [{ score: 0.85, pass: true, latencyMs: 140, costUsd: 0.0008 }],
      },
      {
        caseId: "c2",
        input: { p: "Q2" },
        baselineRuns: [{ score: 0.7, pass: true, latencyMs: 160, costUsd: 0.001 }],
        candidateRuns: [{ score: 0.9, pass: true, latencyMs: 130, costUsd: 0.0008 }],
      },
      {
        caseId: "c3",
        input: { p: "Q3" },
        baselineRuns: [{ score: 0.6, pass: false, latencyMs: 170, costUsd: 0.001 }],
        candidateRuns: [{ score: 0.65, pass: false, latencyMs: 145, costUsd: 0.0008 }],
      },
    ];

    const report1 = compareCells(
      {
        runId: "run-101",
        baselineCell: { id: "cell-b", name: "v1" },
        candidateCell: { id: "cell-c", name: "v2" },
        cases,
      },
      { seed: 777, delta: 0.03 },
    );

    const report2 = compareCells(
      {
        runId: "run-101",
        baselineCell: { id: "cell-b", name: "v1" },
        candidateCell: { id: "cell-c", name: "v2" },
        cases,
      },
      { seed: 777, delta: 0.03 },
    );

    expect(report1.metrics[0]?.baselineMean).toBe(report2.metrics[0]?.baselineMean);
    expect(report1.metrics[0]?.candidateMean).toBe(report2.metrics[0]?.candidateMean);
    expect(report1.metrics[0]?.ci.lower).toBe(report2.metrics[0]?.ci.lower);
    expect(report1.metrics[0]?.ci.upper).toBe(report2.metrics[0]?.ci.upper);
    expect(report1.executiveSummary).toBe(report2.executiveSummary);
  });

  it("sorts per-case top disagreements by absolute difference", () => {
    const cases: CaseComparisonData[] = [
      {
        caseId: "agree",
        input: { text: "agree" },
        baselineRuns: [{ score: 0.8, pass: true }],
        candidateRuns: [{ score: 0.8, pass: true }],
      },
      {
        caseId: "huge-disagree",
        input: { text: "huge" },
        baselineRuns: [{ score: 0.1, pass: false }],
        candidateRuns: [{ score: 0.95, pass: true }],
      },
      {
        caseId: "moderate-disagree",
        input: { text: "mod" },
        baselineRuns: [{ score: 0.6, pass: true }],
        candidateRuns: [{ score: 0.9, pass: true }],
      },
    ];

    const disagreements = computeTopDisagreements(cases, 2);
    expect(disagreements.length).toBe(2);
    expect(disagreements[0]?.caseId).toBe("huge-disagree");
    expect(disagreements[0]?.absoluteDiff).toBeCloseTo(0.85, 2);
    expect(disagreements[1]?.caseId).toBe("moderate-disagree");
    expect(disagreements[1]?.absoluteDiff).toBeCloseTo(0.3, 2);
  });

  it("recommends the cheapest arm within delta of best quality", () => {
    const cells = [
      {
        cellId: "gpt4",
        cellName: "GPT-4 (Best Quality)",
        costUsd: 0.08,
        latencyP95Ms: 900,
        qualityCi: { pointEstimate: 0.94, lower: 0.91, upper: 0.96, confidence: 0.95 },
      },
      {
        cellId: "haiku",
        cellName: "Claude 3.5 Haiku (Cheapest within delta)",
        costUsd: 0.005,
        latencyP95Ms: 300,
        qualityCi: { pointEstimate: 0.92, lower: 0.89, upper: 0.95, confidence: 0.95 },
      },
      {
        cellId: "mini",
        cellName: "Cheap but degraded",
        costUsd: 0.002,
        latencyP95Ms: 250,
        qualityCi: { pointEstimate: 0.82, lower: 0.78, upper: 0.86, confidence: 0.95 },
      },
    ];

    const pareto = evaluateParetoAndRecommend(cells, { delta: 0.03 });

    // Haiku is within delta (0.94 - 0.03 = 0.91 <= 0.92) and costs 0.005 vs 0.08
    expect(pareto.recommendation.recommendedCellId).toBe("haiku");
    expect(pareto.recommendation.caveats.length).toBeGreaterThan(0);
    expect(pareto.recommendation.ruleExplanation).toContain("cheapest arm within delta");
  });

  it("aggregates judge costs separately from generation costs", () => {
    const cases: CaseComparisonData[] = [
      {
        caseId: "c1",
        input: {},
        baselineRuns: [
          {
            score: 1.0,
            pass: true,
            costUsd: 0.01, // generation cost
            judgeCostUsd: 0.004, // judge cost
            latencyMs: 500,
            tokens: { prompt: 200, completion: 50, total: 250 },
          },
        ],
        candidateRuns: [],
      },
    ];

    const usage = aggregateCellResourceUsage("b1", "Base", cases, "baseline");
    expect(usage.generationCostUsd).toBe(0.01);
    expect(usage.judgeCostUsd).toBe(0.004);
    expect(usage.totalCostUsd).toBe(0.014);
    expect(usage.tokens.total).toBe(250);
  });
});
