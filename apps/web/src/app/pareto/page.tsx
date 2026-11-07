"use client";

import { ParetoChart } from "@/components/pareto-chart";
import type { EvaluatedParetoPoint } from "@evalboard/stats";
import { CheckCircle2, HelpCircle, ShieldAlert, Zap } from "lucide-react";
import { useState } from "react";

const SAMPLE_PARETO_POINTS: EvaluatedParetoPoint[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o (Top Quality)",
    costUsd: 0.05,
    quality: { pointEstimate: 0.95, lower: 0.93, upper: 0.97 },
    status: "ON_FRONTIER",
    dominatedBy: [],
    metadata: { latencyP95Ms: 820 },
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    costUsd: 0.03,
    quality: { pointEstimate: 0.94, lower: 0.915, upper: 0.965 },
    status: "ON_FRONTIER",
    dominatedBy: [],
    metadata: { latencyP95Ms: 650 },
  },
  {
    id: "llama-3-3-70b",
    name: "Llama 3.3 70B (OpenRouter)",
    costUsd: 0.006,
    quality: { pointEstimate: 0.92, lower: 0.89, upper: 0.95 },
    status: "ON_FRONTIER",
    dominatedBy: [],
    metadata: { latencyP95Ms: 380 },
  },
  {
    id: "claude-3-5-haiku",
    name: "Claude 3.5 Haiku",
    costUsd: 0.004,
    quality: { pointEstimate: 0.88, lower: 0.85, upper: 0.91 },
    status: "ON_FRONTIER",
    dominatedBy: [],
    metadata: { latencyP95Ms: 290 },
  },
  {
    id: "llama-3-1-8b-local",
    name: "Llama 3.1 8B (Ollama Local)",
    costUsd: 0.0001,
    quality: { pointEstimate: 0.76, lower: 0.72, upper: 0.8 },
    status: "ON_FRONTIER",
    dominatedBy: [],
    metadata: { latencyP95Ms: 190 },
  },
  {
    id: "older-mid-model",
    name: "Legacy Model v1.2",
    costUsd: 0.015,
    quality: { pointEstimate: 0.87, lower: 0.83, upper: 0.9 },
    status: "UNCERTAIN",
    dominatedBy: [],
    metadata: { latencyP95Ms: 510 },
  },
  {
    id: "expensive-inferior-model",
    name: "Legacy Large v0.9",
    costUsd: 0.06,
    quality: { pointEstimate: 0.78, lower: 0.74, upper: 0.82 },
    status: "DOMINATED",
    dominatedBy: ["gpt-4o", "claude-3-5-sonnet", "llama-3-3-70b"],
    metadata: { latencyP95Ms: 950 },
  },
];

export default function ParetoPage() {
  const [points] = useState<EvaluatedParetoPoint[]>(SAMPLE_PARETO_POINTS);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Cost-vs-Quality Pareto Optimization
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Identifying non-dominated model and prompt configurations taking 95% uncertainty intervals
          into account (ADR-004).
        </p>
      </div>

      {/* Recharts Scatter Component */}
      <ParetoChart points={points} qualityMetricName="Benchmark Accuracy" />

      {/* Pareto Recommendation Banner */}
      <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/60 rounded-xl p-5 shadow-sm space-y-2">
        <div className="flex items-center gap-2 text-emerald-900 dark:text-emerald-200 font-semibold text-sm">
          <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Recommended Configuration: Llama 3.3 70B (OpenRouter)</span>
        </div>
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          Decision Rule: Selected as the cheapest arm whose quality point estimate (92.0%) is within
          delta (δ = 0.03) of the highest performing arm (GPT-4o at 95.0%).
        </p>
        <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
          <li>Saves 88% in generation cost ($0.006 vs $0.050 per run) compared to top model.</li>
          <li>Low latency: 380ms p95 latency enables real-time user-facing features.</li>
          <li>
            Caveat: Confidence interval lower bound is 89.0%; verify domain edge cases before
            production rollout.
          </li>
        </ul>
      </div>

      {/* Points Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Configuration Status Table
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-medium">
                <th className="py-2.5">Configuration</th>
                <th className="py-2.5 text-right">Cost ($ USD)</th>
                <th className="py-2.5 text-right">p95 Latency</th>
                <th className="py-2.5 text-right">Quality Mean [95% CI]</th>
                <th className="py-2.5 text-center">Pareto Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {points.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                    {p.name}
                  </td>
                  <td className="py-3 text-right">${p.costUsd.toFixed(4)}</td>
                  <td className="py-3 text-right">
                    {typeof p.metadata?.latencyP95Ms === "number"
                      ? `${p.metadata.latencyP95Ms}ms`
                      : "-"}
                  </td>
                  <td className="py-3 text-right">
                    <span className="font-semibold">
                      {(p.quality.pointEstimate * 100).toFixed(1)}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-normal ml-1">
                      [{(p.quality.lower * 100).toFixed(1)}%, {(p.quality.upper * 100).toFixed(1)}%]
                    </span>
                  </td>
                  <td className="py-3 text-center">
                    {p.status === "ON_FRONTIER" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3" /> ON FRONTIER
                      </span>
                    )}
                    {p.status === "UNCERTAIN" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                        <HelpCircle className="w-3 h-3" /> UNCERTAIN
                      </span>
                    )}
                    {p.status === "DOMINATED" && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                        <ShieldAlert className="w-3 h-3" /> DOMINATED
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
