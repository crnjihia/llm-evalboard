"use client";

import { ForestPlot } from "@/components/forest-plot";
import { JudgeTrustBadge } from "@/components/judge-trust-badge";
import { VerdictBadge } from "@/components/verdict-badge";
import type { ComparisonReport } from "@evalboard/core";
import {
  AlertTriangle,
  ArrowRight,
  BarChart2,
  ChevronDown,
  Clock,
  DollarSign,
  Layers,
  Sparkles,
  Zap,
} from "lucide-react";
import { useState } from "react";

// Mock comparison data for out-of-the-box instant rendering and Playwright smoke testing
const DEFAULT_MOCK_REPORT: ComparisonReport = {
  runId: "run-e8f2a1b9-3c4d-4e5f",
  baselineCell: { id: "cell-base-001", name: "Claude 3.5 Haiku (Baseline)" },
  candidateCell: { id: "cell-cand-002", name: "Llama 3.3 70B (Candidate)" },
  metrics: [
    {
      metric: "JSON Schema Validity",
      baselineMean: 0.88,
      baselineCi: { pointEstimate: 0.88, lower: 0.84, upper: 0.91, confidence: 0.95 },
      candidateMean: 0.96,
      candidateCi: { pointEstimate: 0.96, lower: 0.93, upper: 0.98, confidence: 0.95 },
      diff: 0.08,
      ci: { pointEstimate: 0.08, lower: 0.045, upper: 0.115, confidence: 0.95 },
      verdict: "BETTER",
      pValue: 0.0078,
      delta: 0.03,
      nPairs: 100,
      excludedPairs: 0,
      reasoning:
        "Candidate reliably outperforms baseline: difference d = +0.0800 meets or exceeds delta (0.03), and 95% CI [0.0450, 0.1150] is strictly above 0.",
    },
    {
      metric: "Semantic Rubric Score",
      baselineMean: 0.82,
      baselineCi: { pointEstimate: 0.82, lower: 0.78, upper: 0.85, confidence: 0.95 },
      candidateMean: 0.825,
      candidateCi: { pointEstimate: 0.825, lower: 0.79, upper: 0.86, confidence: 0.95 },
      diff: 0.005,
      ci: { pointEstimate: 0.005, lower: -0.018, upper: 0.024, confidence: 0.95 },
      verdict: "NO MEANINGFUL DIFFERENCE",
      delta: 0.03,
      nPairs: 100,
      excludedPairs: 0,
      reasoning:
        "Candidate and baseline are practically equivalent: difference d = +0.0050, and entire 95% CI [-0.0180, 0.0240] is contained within the [+-0.03] zone of indifference.",
    },
    {
      metric: "Conciseness Constraint",
      baselineMean: 0.91,
      baselineCi: { pointEstimate: 0.91, lower: 0.87, upper: 0.94, confidence: 0.95 },
      candidateMean: 0.78,
      candidateCi: { pointEstimate: 0.78, lower: 0.72, upper: 0.83, confidence: 0.95 },
      diff: -0.13,
      ci: { pointEstimate: -0.13, lower: -0.185, upper: -0.075, confidence: 0.95 },
      verdict: "WORSE",
      delta: 0.03,
      nPairs: 100,
      excludedPairs: 0,
      reasoning:
        "Candidate reliably degrades performance: difference d = -0.1300 meets or exceeds -delta (-0.03), and 95% CI [-0.1850, -0.0750] is strictly below 0.",
    },
    {
      metric: "Domain Reasoning (N=15)",
      baselineMean: 0.7,
      baselineCi: { pointEstimate: 0.7, lower: 0.58, upper: 0.82, confidence: 0.95 },
      candidateMean: 0.73,
      candidateCi: { pointEstimate: 0.73, lower: 0.6, upper: 0.84, confidence: 0.95 },
      diff: 0.03,
      ci: { pointEstimate: 0.03, lower: -0.08, upper: 0.14, confidence: 0.95 },
      verdict: "INCONCLUSIVE",
      delta: 0.03,
      nPairs: 15,
      excludedPairs: 0,
      reasoning:
        "Evidence is insufficient to distinguish effect from noise: difference d = +0.0300 with 95% CI [-0.0800, 0.1400] spans across the decision boundary. Estimated 64 additional test cases needed to achieve 80% power at delta = 0.03.",
      estimatedAdditionalCases: 64,
    },
  ],
  slices: [
    {
      sliceKey: "category",
      sliceValue: "customer_support",
      sampleSize: 45,
      isSmallSample: false,
      baselineMean: 0.85,
      candidateMean: 0.94,
      diff: 0.09,
      ci: { pointEstimate: 0.09, lower: 0.04, upper: 0.14, confidence: 0.95 },
      verdict: "BETTER",
      isSimpsonsAnomaly: false,
    },
    {
      sliceKey: "category",
      sliceValue: "financial_advisory",
      sampleSize: 18,
      isSmallSample: false,
      baselineMean: 0.92,
      candidateMean: 0.74,
      diff: -0.18,
      ci: { pointEstimate: -0.18, lower: -0.26, upper: -0.09, confidence: 0.95 },
      verdict: "WORSE",
      isSimpsonsAnomaly: true,
      simpsonsReasoning:
        "Simpson's paradox detected: Overall performance improved (+0.0800), but in slice 'category=financial_advisory', candidate significantly regressed (-0.1800, CI [-0.2600, -0.0900]).",
    },
    {
      sliceKey: "tag",
      sliceValue: "edge_case_unicode",
      sampleSize: 6,
      isSmallSample: true,
      warning: "n too small (n = 6 < 10); do not draw firm conclusions",
      baselineMean: 0.83,
      candidateMean: 0.83,
      diff: 0.0,
      ci: { pointEstimate: 0.0, lower: -0.12, upper: 0.12, confidence: 0.95 },
      verdict: "INCONCLUSIVE",
      isSimpsonsAnomaly: false,
    },
  ],
  simpsonsAnomalies: [
    {
      sliceKey: "category",
      sliceValue: "financial_advisory",
      sampleSize: 18,
      isSmallSample: false,
      baselineMean: 0.92,
      candidateMean: 0.74,
      diff: -0.18,
      ci: { pointEstimate: -0.18, lower: -0.26, upper: -0.09, confidence: 0.95 },
      verdict: "WORSE",
      isSimpsonsAnomaly: true,
      simpsonsReasoning:
        "Simpson's paradox detected: Overall performance improved (+0.0800), but in slice 'category=financial_advisory', candidate significantly regressed (-0.1800, CI [-0.2600, -0.0900]).",
    },
  ],
  topDisagreements: [
    {
      caseId: "case-fin-004",
      input: {
        query:
          "Calculate optimal amortisation schedule for a $450k mortgage at 6.2% with balloon payment.",
      },
      baselineScore: 1.0,
      candidateScore: 0.0,
      absoluteDiff: 1.0,
      baselineOutput:
        '{"schedule": [{"month": 1, "interest": 2325, "principal": 431}], "balloonPayment": 120000}',
      candidateOutput:
        "Here is your loan calculation: You will pay approximately $2756/month. Balloon payment is not supported.",
      baselineReason: "Exact JSON Schema match. Numeric values verified within 0.01 tolerance.",
      candidateReason: "Schema validation failed: output must be valid JSON object.",
      baselineCostUsd: 0.0012,
      candidateCostUsd: 0.0006,
      baselineLatencyMs: 380,
      candidateLatencyMs: 290,
    },
    {
      caseId: "case-cs-019",
      input: {
        query:
          "User requests refund for digital item purchased 42 days ago (policy limit is 30 days).",
      },
      baselineScore: 0.2,
      candidateScore: 1.0,
      absoluteDiff: 0.8,
      baselineOutput: "Sure! I have processed your refund request.",
      candidateOutput:
        "I apologize, but our refund policy allows returns within 30 days of purchase. Since this purchase was 42 days ago, I cannot issue a refund. However, I can offer a 15% store credit.",
      baselineReason: "Policy violation: approved refund outside policy limit.",
      candidateReason: "Policy accurately enforced with polite secondary retention offer.",
      baselineCostUsd: 0.001,
      candidateCostUsd: 0.0007,
      baselineLatencyMs: 340,
      candidateLatencyMs: 250,
    },
  ],
  usage: {
    baseline: {
      cellId: "cell-base-001",
      cellName: "Claude 3.5 Haiku",
      generationCostUsd: 0.082,
      judgeCostUsd: 0.035,
      totalCostUsd: 0.117,
      costPer1kCasesUsd: 1.17,
      latencyMeanMs: 410,
      latencyP50Ms: 380,
      latencyP95Ms: 640,
      tokens: { prompt: 45000, completion: 22000, total: 67000 },
    },
    candidate: {
      cellId: "cell-cand-002",
      cellName: "Llama 3.3 70B",
      generationCostUsd: 0.041,
      judgeCostUsd: 0.035,
      totalCostUsd: 0.076,
      costPer1kCasesUsd: 0.76,
      latencyMeanMs: 290,
      latencyP50Ms: 260,
      latencyP95Ms: 450,
      tokens: { prompt: 43000, completion: 21000, total: 64000 },
    },
  },
  pareto: {
    qualityMetric: "Overall Quality",
    points: [],
    frontier: [],
    uncertain: [],
    dominated: [],
    recommendation: {
      recommendedCellId: "cell-cand-002",
      recommendedCellName: "Llama 3.3 70B",
      ruleExplanation:
        "Selected as the cheapest arm whose quality point estimate is within delta (0.03) of the highest performing arm.",
      caveats: [
        "Saves 35% in cost ($0.76 vs $1.17 per 1k cases) and 30% lower p95 latency (450ms vs 640ms).",
        "Caution: Simpson's paradox alert detected on 'financial_advisory' cases.",
      ],
    },
  },
  executiveSummary:
    "Llama 3.3 70B is better than Claude 3.5 Haiku on JSON Schema Validity (+8.0 pts, 95% CI [4.5, 11.5], δ = 3.0 pts), shows no meaningful difference compared to Claude 3.5 Haiku on Semantic Rubric Score (+0.5 pts, 95% CI [-1.8, 2.4], δ = 3.0 pts), is worse than Claude 3.5 Haiku on Conciseness Constraint (-13.0 pts, 95% CI [-18.5, -7.5], δ = 3.0 pts), and Llama 3.3 70B vs Claude 3.5 Haiku on Domain Reasoning (N=15) is inconclusive (+3.0 pts, 95% CI [-8.0, 14.0], δ = 3.0 pts; estimated 64 more cases needed). Llama 3.3 70B costs 35% less ($0.76 vs $1.17 per 1k cases) with a p95 latency of 450ms. Caution: Simpson's paradox detected in slice 'category=financial_advisory' (-18.0 pts), directly contradicting the overall evaluation trajectory.",
};

export default function ComparePage() {
  const [report] = useState<ComparisonReport>(DEFAULT_MOCK_REPORT);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Run: {report.runId}
            </span>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-semibold">
              Paired Evaluation
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
            <span>{report.baselineCell.name}</span>
            <ArrowRight className="w-5 h-5 text-slate-400" />
            <span className="text-indigo-600 dark:text-indigo-400">
              {report.candidateCell.name}
            </span>
          </h1>
        </div>

        {/* Judge Calibration Trust Badge */}
        <div className="flex items-center gap-3 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
          <span className="text-slate-500 font-medium">LLM Judge Trust:</span>
          <JudgeTrustBadge level="TRUSTED" kappa={0.78} />
        </div>
      </div>

      {/* Hero Section: Executive Summary Banner */}
      <section
        aria-label="Executive Summary"
        className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 rounded-xl p-5 shadow-sm"
      >
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
              Statistical Executive Summary
            </h2>
            <p
              id="executive-summary"
              className="text-sm leading-relaxed text-slate-800 dark:text-slate-200"
            >
              {report.executiveSummary}
            </p>
          </div>
        </div>
      </section>

      {/* Simpson's Paradox Warning Alert if present */}
      {report.simpsonsAnomalies.length > 0 && (
        <section
          aria-label="Simpson's Paradox Alert"
          className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 rounded-xl p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="space-y-1 text-sm">
            <div className="font-semibold text-amber-900 dark:text-amber-200">
              Simpson's Paradox Detected on 1 Slice
            </div>
            {report.simpsonsAnomalies.map((a) => (
              <p
                key={a.sliceValue}
                className="text-amber-800 dark:text-amber-300 text-xs leading-relaxed"
              >
                {a.simpsonsReasoning}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Main Grid: Metric Summary Table & Forest Plot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Metric Summary Table (Left 7 cols) */}
        <section
          aria-label="Metrics Table"
          className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-slate-500" />
              <span>Statistical Metric Comparisons</span>
            </h2>
            <span className="text-xs text-slate-500">δ = 0.03 (3.0 pts) | 95% Confidence</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 font-medium">Metric</th>
                  <th className="py-2.5 font-medium text-right">Baseline</th>
                  <th className="py-2.5 font-medium text-right">Candidate</th>
                  <th className="py-2.5 font-medium text-right">Diff [95% CI]</th>
                  <th className="py-2.5 font-medium text-center">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {report.metrics.map((m) => {
                  const sign = m.diff >= 0 ? "+" : "";
                  return (
                    <tr
                      key={m.metric}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 font-sans font-medium text-slate-800 dark:text-slate-200">
                        {m.metric}
                        {m.pValue !== undefined && (
                          <div className="text-[10px] text-slate-500 font-mono">
                            McNemar p = {m.pValue.toFixed(4)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">
                        {(m.baselineMean * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 text-right text-slate-600 dark:text-slate-400">
                        {(m.candidateMean * 100).toFixed(1)}%
                      </td>
                      <td className="py-3 text-right font-semibold">
                        <span
                          className={
                            m.verdict === "BETTER"
                              ? "text-emerald-600 dark:text-emerald-400"
                              : m.verdict === "WORSE"
                                ? "text-rose-600 dark:text-rose-400"
                                : "text-slate-700 dark:text-slate-300"
                          }
                        >
                          {sign}
                          {(m.diff * 100).toFixed(1)}%
                        </span>
                        <div className="text-[10px] text-slate-500 font-normal">
                          [{(m.ci.lower * 100).toFixed(1)}%, {(m.ci.upper * 100).toFixed(1)}%]
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <VerdictBadge verdict={m.verdict} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Forest Plot of Differences (Right 5 cols) */}
        <section aria-label="Forest Plot" className="lg:col-span-5 flex flex-col">
          <ForestPlot metrics={report.metrics} delta={0.03} width={500} />
        </section>
      </div>

      {/* Cost, Latency & Pareto Recommendation */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cost Comparison */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm">
            <DollarSign className="w-4 h-4 text-emerald-500" />
            <span>Cost Efficiency ($ / 1k cases)</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-500">Baseline</div>
              <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-200">
                ${report.usage.baseline.costPer1kCasesUsd.toFixed(2)}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-xs text-slate-500">Candidate</div>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                ${report.usage.candidate.costPer1kCasesUsd.toFixed(2)}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between">
            <span>Judge Cost (Recorded Separately):</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              ${report.usage.candidate.judgeCostUsd.toFixed(3)}
            </span>
          </div>
        </div>

        {/* Latency Comparison */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-semibold text-sm">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Latency Distribution (p95)</span>
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-xs text-slate-500">Baseline p95</div>
              <div className="text-xl font-bold font-mono text-slate-800 dark:text-slate-200">
                {Math.round(report.usage.baseline.latencyP95Ms)}ms
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400" />
            <div>
              <div className="text-xs text-slate-500">Candidate p95</div>
              <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
                {Math.round(report.usage.candidate.latencyP95Ms)}ms
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500 border-t border-slate-100 dark:border-slate-800 pt-2 flex justify-between">
            <span>Median Latency (p50):</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {Math.round(report.usage.candidate.latencyP50Ms)}ms
            </span>
          </div>
        </div>

        {/* Pareto Recommendation Card */}
        <div className="bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-5 shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-semibold text-sm">
            <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>Recommended Arm: {report.pareto.recommendation.recommendedCellName}</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            {report.pareto.recommendation.ruleExplanation}
          </p>
          <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
            {report.pareto.recommendation.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Slices Analysis Table */}
      <section
        aria-label="Slice Analysis"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-500" />
            <span>Subgroup Slice Analysis</span>
          </h2>
          <span className="text-xs text-slate-500">Min Slice Size: N ≥ 10</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 font-medium">Slice</th>
                <th className="py-2.5 font-medium text-center">Sample Size (N)</th>
                <th className="py-2.5 font-medium text-right">Baseline Mean</th>
                <th className="py-2.5 font-medium text-right">Candidate Mean</th>
                <th className="py-2.5 font-medium text-right">Paired Diff [95% CI]</th>
                <th className="py-2.5 font-medium text-center">Verdict</th>
                <th className="py-2.5 font-medium">Warnings / Alerts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {report.slices.map((s) => (
                <tr
                  key={`${s.sliceKey}-${s.sliceValue}`}
                  className={
                    s.isSimpsonsAnomaly
                      ? "bg-amber-50/60 dark:bg-amber-950/20 font-medium"
                      : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                  }
                >
                  <td className="py-3 font-sans text-slate-800 dark:text-slate-200">
                    <span className="font-semibold text-slate-500">{s.sliceKey}:</span>{" "}
                    {s.sliceValue}
                  </td>
                  <td className="py-3 text-center">{s.sampleSize}</td>
                  <td className="py-3 text-right">{(s.baselineMean * 100).toFixed(1)}%</td>
                  <td className="py-3 text-right">{(s.candidateMean * 100).toFixed(1)}%</td>
                  <td className="py-3 text-right font-semibold">
                    {s.diff >= 0 ? "+" : ""}
                    {(s.diff * 100).toFixed(1)}%
                    <div className="text-[10px] text-slate-500 font-normal">
                      [{(s.ci.lower * 100).toFixed(1)}%, {(s.ci.upper * 100).toFixed(1)}%]
                    </div>
                  </td>
                  <td className="py-3 text-center">
                    <VerdictBadge verdict={s.verdict} />
                  </td>
                  <td className="py-3 font-sans">
                    {s.isSimpsonsAnomaly && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950 px-2 py-0.5 rounded">
                        <AlertTriangle className="w-3 h-3" /> Simpson's Paradox
                      </span>
                    )}
                    {s.isSmallSample && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                        n &lt; 10 (low power)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Per-Case Disagreements Drill-Down */}
      <section
        aria-label="Case Disagreements"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ChevronDown className="w-4 h-4 text-slate-500" />
            <span>Top Disagreements Drill-Down (Sorted by Absolute Difference)</span>
          </h2>
          <span className="text-xs text-slate-500">
            Cases where baseline and candidate diverged most
          </span>
        </div>

        <div className="space-y-3">
          {report.topDisagreements.map((d) => (
            <div
              key={d.caseId}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                  Case ID: {d.caseId}
                </span>
                <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                  |Diff| = {(d.absoluteDiff * 100).toFixed(0)}%
                </span>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950 p-2.5 rounded text-xs font-mono text-slate-700 dark:text-slate-300">
                <span className="text-slate-500 font-sans font-semibold">Input: </span>
                {JSON.stringify(d.input)}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                {/* Baseline Output */}
                <div className="border border-slate-200 dark:border-slate-800 rounded p-3 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400">
                      {report.baselineCell.name}
                    </span>
                    <span className="font-mono font-bold">
                      Score: {(d.baselineScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <pre className="p-2 bg-slate-50 dark:bg-slate-950 rounded text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                    {d.baselineOutput}
                  </pre>
                  {d.baselineReason && (
                    <div className="text-[11px] text-slate-500 italic">
                      Reason: {d.baselineReason}
                    </div>
                  )}
                </div>

                {/* Candidate Output */}
                <div className="border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/20 dark:bg-indigo-950/10 rounded p-3 space-y-1.5">
                  <div className="flex items-center justify-between font-semibold">
                    <span className="text-indigo-700 dark:text-indigo-300">
                      {report.candidateCell.name}
                    </span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      Score: {(d.candidateScore * 100).toFixed(0)}%
                    </span>
                  </div>
                  <pre className="p-2 bg-slate-50 dark:bg-slate-950 rounded text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                    {d.candidateOutput}
                  </pre>
                  {d.candidateReason && (
                    <div className="text-[11px] text-indigo-700 dark:text-indigo-300 italic">
                      Reason: {d.candidateReason}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
