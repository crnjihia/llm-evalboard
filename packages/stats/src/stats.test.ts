import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adjustPValuesBh,
  adjustPValuesHolm,
  bootstrapConfidenceInterval,
  computeParetoFrontier,
  computeRepeatsAnova,
  createPrng,
  detectRegressionsEwma,
  estimateAdditionalCasesNeeded,
  estimateRequiredSampleSize,
  evaluateVerdict,
  mcnemarExactTest,
  mean,
  normalPpf,
  standardDeviation,
  wilsonScoreInterval,
} from "./index.js";

interface ConformanceStats {
  wilson: Array<{
    successes: number;
    total: number;
    confidence: number;
    expected: {
      proportion: number;
      lower: number;
      upper: number;
      confidence: number;
    };
  }>;
  mcnemar: Array<{
    b: number;
    c: number;
    expected: {
      p_value: number;
      b: number;
      c: number;
    };
  }>;
  anova: {
    cases_data: number[][];
    expected: {
      k_cases: number;
      m_repeats: number;
      msb: number;
      msw: number;
      var_between: number;
      var_within: number;
      icc: number;
      pct_model_noise: number;
      pct_case_variance: number;
    };
  };
  power: Array<{
    std_diff: number;
    delta: number;
    alpha: number;
    power: number;
    expected: {
      std_diff: number;
      delta: number;
      alpha: number;
      power: number;
      n_required: number;
    };
  }>;
  multipleComparisons: {
    raw_p_values: number[];
    expected_holm: number[];
    expected_bh: number[];
  };
}

const vectorsPath = resolve(__dirname, "../../../conformance/vectors/stats.json");
const vectors: ConformanceStats = JSON.parse(readFileSync(vectorsPath, "utf-8"));

describe("Phase 7 Conformance Vectors", () => {
  it("matches Python reference for Wilson score confidence intervals", () => {
    for (const vec of vectors.wilson) {
      const res = wilsonScoreInterval(vec.successes, vec.total, vec.confidence);
      expect(res.pointEstimate).toBeCloseTo(vec.expected.proportion, 5);
      expect(res.lower).toBeCloseTo(vec.expected.lower, 4);
      expect(res.upper).toBeCloseTo(vec.expected.upper, 4);
    }
  });

  it("matches Python reference for McNemar exact test p-values", () => {
    for (const vec of vectors.mcnemar) {
      const res = mcnemarExactTest(vec.b, vec.c);
      expect(res.pValue).toBeCloseTo(vec.expected.p_value, 5);
    }
  });

  it("matches Python reference for ANOVA and ICC repeat variance decomposition", () => {
    const anova = computeRepeatsAnova(vectors.anova.cases_data);
    const exp = vectors.anova.expected;

    expect(anova.kCases).toBe(exp.k_cases);
    expect(anova.mRepeats).toBe(exp.m_repeats);
    expect(anova.msb).toBeCloseTo(exp.msb, 4);
    expect(anova.msw).toBeCloseTo(exp.msw, 5);
    expect(anova.varBetween).toBeCloseTo(exp.var_between, 4);
    expect(anova.varWithin).toBeCloseTo(exp.var_within, 5);
    expect(anova.icc).toBeCloseTo(exp.icc, 4);
    expect(anova.pctModelNoise).toBeCloseTo(exp.pct_model_noise, 1);
    expect(anova.pctCaseVariance).toBeCloseTo(exp.pct_case_variance, 1);
    expect(anova.recommendation.recommendedRepeats).toBe("1-2 repeats");
  });

  it("matches Python reference for paired sample size / power calculations", () => {
    for (const vec of vectors.power) {
      const n = estimateRequiredSampleSize(vec.std_diff, vec.delta, {
        alpha: vec.alpha,
        power: vec.power,
      });
      expect(n).toBe(vec.expected.n_required);
    }
  });

  it("matches Python reference for Holm and Benjamini-Hochberg multiple comparisons", () => {
    const raw = vectors.multipleComparisons.raw_p_values;
    const holm = adjustPValuesHolm(raw);
    const bh = adjustPValuesBh(raw);

    for (let i = 0; i < raw.length; i++) {
      const expHolm = vectors.multipleComparisons.expected_holm[i] ?? 0;
      const expBh = vectors.multipleComparisons.expected_bh[i] ?? 0;
      expect(holm[i]).toBeCloseTo(expHolm, 5);
      expect(bh[i]).toBeCloseTo(expBh, 5);
    }
  });
});

describe("Descriptive Statistics and Bootstrap CI", () => {
  it("computes basic summary statistics correctly", () => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(mean(data)).toBe(5);
    expect(standardDeviation(data, 1)).toBeCloseTo(2.138, 3);
  });

  it("normalPpf computes standard quantiles accurately", () => {
    expect(normalPpf(0.5)).toBe(0);
    expect(normalPpf(0.975)).toBeCloseTo(1.95996, 4);
    expect(normalPpf(0.025)).toBeCloseTo(-1.95996, 4);
    expect(normalPpf(0.99)).toBeCloseTo(2.32635, 4);
    expect(normalPpf(0.995)).toBeCloseTo(2.57583, 4);
  });

  it("simulates empirical coverage of 95% bootstrap confidence interval", () => {
    // Generate 100 synthetic datasets with known mean = 0.50
    const prng = createPrng(12345);
    const trueMean = 0.5;
    let coveredCount = 0;
    const nDatasets = 100;
    const sampleSize = 30;

    for (let d = 0; d < nDatasets; d++) {
      const sample: number[] = [];
      for (let i = 0; i < sampleSize; i++) {
        // Uniform [0.3, 0.7] with mean 0.5
        sample.push(0.3 + prng() * 0.4);
      }
      const ci = bootstrapConfidenceInterval(sample, {
        confidence: 0.95,
        resamples: 500,
        seed: d + 1,
      });

      if (trueMean >= ci.lower && trueMean <= ci.upper) {
        coveredCount++;
      }
    }

    const empiricalCoverage = coveredCount / nDatasets;
    // For a 95% CI across 100 samples, coverage is expected to be between 90% and 99%
    expect(empiricalCoverage).toBeGreaterThanOrEqual(0.9);
    expect(empiricalCoverage).toBeLessThanOrEqual(1.0);
  });
});

describe("Four-Way Statistical Verdict Rules (ADR-003)", () => {
  const delta = 0.03;

  it("produces BETTER when L > 0 and d >= delta", () => {
    // Baseline: ~0.70, Candidate: ~0.80 (d = +0.10, clear improvement)
    const baseline = [0.7, 0.72, 0.68, 0.71, 0.69, 0.7, 0.71, 0.69, 0.72, 0.7];
    const candidate = [0.8, 0.82, 0.79, 0.81, 0.8, 0.81, 0.79, 0.8, 0.81, 0.8];

    const result = evaluateVerdict(baseline, candidate, { delta, seed: 42 });
    expect(result.verdict).toBe("BETTER");
    expect(result.d).toBeGreaterThanOrEqual(delta);
    expect(result.ci.lower).toBeGreaterThan(0);
    expect(result.reasoning).toContain("Candidate reliably outperforms baseline");
  });

  it("produces WORSE when U < 0 and d <= -delta", () => {
    // Baseline: ~0.80, Candidate: ~0.70 (d = -0.10, clear degradation)
    const baseline = [0.8, 0.82, 0.79, 0.81, 0.8, 0.81, 0.79, 0.8, 0.81, 0.8];
    const candidate = [0.7, 0.72, 0.68, 0.71, 0.69, 0.7, 0.71, 0.69, 0.72, 0.7];

    const result = evaluateVerdict(baseline, candidate, { delta, seed: 42 });
    expect(result.verdict).toBe("WORSE");
    expect(result.d).toBeLessThanOrEqual(-delta);
    expect(result.ci.upper).toBeLessThan(0);
    expect(result.reasoning).toContain("Candidate reliably degrades performance");
  });

  it("produces NO MEANINGFUL DIFFERENCE when whole CI is within [-delta, delta]", () => {
    // Both near 0.80 with minimal differences (|d| < 0.01)
    const baseline = [0.8, 0.8, 0.81, 0.79, 0.8, 0.81, 0.8, 0.79, 0.8, 0.8];
    const candidate = [0.8, 0.81, 0.8, 0.8, 0.79, 0.8, 0.81, 0.8, 0.8, 0.79];

    const result = evaluateVerdict(baseline, candidate, { delta, seed: 42 });
    expect(result.verdict).toBe("NO MEANINGFUL DIFFERENCE");
    expect(result.ci.lower).toBeGreaterThan(-delta);
    expect(result.ci.upper).toBeLessThan(delta);
    expect(result.reasoning).toContain("Candidate and baseline are practically equivalent");
  });

  it("produces INCONCLUSIVE when CI is too wide or crosses delta boundary", () => {
    // High variance small sample where interval spans across delta zone
    const baseline = [0.5, 0.9, 0.4, 0.8, 0.6];
    const candidate = [0.6, 0.7, 0.7, 0.7, 0.8];

    const result = evaluateVerdict(baseline, candidate, { delta, seed: 42 });
    expect(result.verdict).toBe("INCONCLUSIVE");
    expect(result.estimatedAdditionalCases).toBeDefined();
    expect(result.estimatedAdditionalCases).toBeGreaterThanOrEqual(0);
    expect(result.reasoning).toContain("additional test cases needed");
  });

  it("power sample size increases monotonically as delta decreases", () => {
    const std = 0.15;
    const nDelta05 = estimateRequiredSampleSize(std, 0.05);
    const nDelta03 = estimateRequiredSampleSize(std, 0.03);
    const nDelta01 = estimateRequiredSampleSize(std, 0.01);

    expect(nDelta01).toBeGreaterThan(nDelta03);
    expect(nDelta03).toBeGreaterThan(nDelta05);

    const needed = estimateAdditionalCasesNeeded(50, std, 0.03);
    expect(needed).toBe(nDelta03 - 50);
  });
});

describe("Cost-vs-Quality Pareto Frontier under Uncertainty (ADR-004)", () => {
  it("classifies strictly dominated, uncertain, and frontier points", () => {
    const points = [
      {
        id: "p1",
        name: "Cheap & High Quality",
        costUsd: 0.01,
        quality: { pointEstimate: 0.95, lower: 0.93, upper: 0.97 },
      },
      {
        id: "p2",
        name: "Expensive & Lower Quality (Strictly Dominated by p1)",
        costUsd: 0.05,
        quality: { pointEstimate: 0.8, lower: 0.75, upper: 0.85 },
      },
      {
        id: "p3",
        name: "Mid Cost & Overlapping Quality (Uncertain)",
        costUsd: 0.02,
        quality: { pointEstimate: 0.93, lower: 0.89, upper: 0.96 },
      },
      {
        id: "p4",
        name: "Ultracheap & Moderate Quality",
        costUsd: 0.002,
        quality: { pointEstimate: 0.7, lower: 0.68, upper: 0.72 },
      },
    ];

    const result = computeParetoFrontier(points);

    // p1 and p4 are clearly on the frontier:
    // p1 has highest quality
    // p4 is cheapest of all
    expect(result.frontier.map((p) => p.id)).toContain("p1");
    expect(result.frontier.map((p) => p.id)).toContain("p4");

    // p2 is strictly dominated by p1: p1 is cheaper (0.01 < 0.05) and p1.lower (0.93) > p2.upper (0.85)
    expect(result.dominated.map((p) => p.id)).toContain("p2");
    const p2Eval = result.dominated.find((p) => p.id === "p2");
    expect(p2Eval?.dominatedBy).toContain("p1");

    // p3 is more expensive than p1 but has lower point estimate with overlapping CI
    expect(result.uncertain.map((p) => p.id)).toContain("p3");
  });
});

describe("EWMA Regression and Drift Detection", () => {
  it("detects sudden regression drops beyond control limits", () => {
    const history = [
      { runId: "r1", timestamp: "2026-01-01", value: 0.92 },
      { runId: "r2", timestamp: "2026-01-02", value: 0.93 },
      { runId: "r3", timestamp: "2026-01-03", value: 0.91 },
      { runId: "r4", timestamp: "2026-01-04", value: 0.92 },
      { runId: "r5", timestamp: "2026-01-05", value: 0.93 },
      // Sudden sharp performance regression
      { runId: "r6", timestamp: "2026-01-06", value: 0.65 },
      { runId: "r7", timestamp: "2026-01-07", value: 0.6 },
    ];

    const result = detectRegressionsEwma(history, {
      lambda: 0.3,
      baselineWindowSize: 5,
    });

    expect(result.hasAlert).toBe(true);
    expect(result.maxSeverity).toBe("critical");
    expect(result.anomalies.map((a) => a.runId)).toContain("r6");
    expect(result.anomalies.map((a) => a.runId)).toContain("r7");
  });

  it("remains quiet on stable in-control process", () => {
    const history = [
      { runId: "r1", timestamp: "2026-01-01", value: 0.9 },
      { runId: "r2", timestamp: "2026-01-02", value: 0.91 },
      { runId: "r3", timestamp: "2026-01-03", value: 0.89 },
      { runId: "r4", timestamp: "2026-01-04", value: 0.9 },
      { runId: "r5", timestamp: "2026-01-05", value: 0.92 },
      { runId: "r6", timestamp: "2026-01-06", value: 0.9 },
      { runId: "r7", timestamp: "2026-01-07", value: 0.91 },
    ];

    const result = detectRegressionsEwma(history, {
      lambda: 0.2,
      baselineWindowSize: 5,
    });

    expect(result.hasAlert).toBe(false);
    expect(result.maxSeverity).toBe("none");
    expect(result.anomalies.length).toBe(0);
  });
});
