"use client";

import type { EvaluatedParetoPoint } from "@evalboard/stats";
import { useState } from "react";
import {
  CartesianGrid,
  ErrorBar,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ParetoChartProps {
  points: EvaluatedParetoPoint[];
  qualityMetricName?: string;
}

export function ParetoChart({ points, qualityMetricName = "Quality Score" }: ParetoChartProps) {
  const [xAxisMode, setXAxisMode] = useState<"cost" | "latency">("cost");

  const chartData = points.map((p) => {
    const latency = typeof p.metadata?.latencyP95Ms === "number" ? p.metadata.latencyP95Ms : 0;

    return {
      id: p.id,
      name: p.name,
      x: xAxisMode === "cost" ? p.costUsd : latency,
      quality: p.quality.pointEstimate,
      errorY: [
        Math.max(0, p.quality.pointEstimate - p.quality.lower),
        Math.max(0, p.quality.upper - p.quality.pointEstimate),
      ],
      lower: p.quality.lower,
      upper: p.quality.upper,
      costUsd: p.costUsd,
      latencyP95Ms: latency,
      status: p.status,
    };
  });

  const frontierData = chartData.filter((d) => d.status === "ON_FRONTIER");
  const uncertainData = chartData.filter((d) => d.status === "UNCERTAIN");
  const dominatedData = chartData.filter((d) => d.status === "DOMINATED");

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Pareto Frontier under Statistical Uncertainty
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evaluating {qualityMetricName} vs.{" "}
            {xAxisMode === "cost" ? "Cost ($ USD)" : "p95 Latency (ms)"} with 95% Confidence
            Intervals
          </p>
        </div>

        {/* Toggle between Cost and Latency */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setXAxisMode("cost")}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              xAxisMode === "cost"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Cost ($ USD)
          </button>
          <button
            type="button"
            onClick={() => setXAxisMode("latency")}
            className={`px-3 py-1 rounded-md font-medium transition-colors ${
              xAxisMode === "latency"
                ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
            }`}
          >
            Latency (p95 ms)
          </button>
        </div>
      </div>

      <div className="w-full h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
            <XAxis
              type="number"
              dataKey="x"
              name={xAxisMode === "cost" ? "Cost" : "Latency"}
              unit={xAxisMode === "cost" ? " $" : " ms"}
              tickFormatter={(val) =>
                xAxisMode === "cost" ? `$${val.toFixed(4)}` : `${Math.round(val)}ms`
              }
              domain={["dataMin - 0.0005", "dataMax + 0.0005"]}
              fontSize={12}
            />
            <YAxis
              type="number"
              dataKey="quality"
              name="Quality"
              domain={[0, 1]}
              tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
              fontSize={12}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const data = payload[0]?.payload;
                if (!data) return null;
                return (
                  <div className="bg-slate-900 text-white text-xs p-3 rounded-lg shadow-xl border border-slate-700 max-w-xs">
                    <div className="font-semibold text-sm mb-1">{data.name}</div>
                    <div className="text-slate-300">
                      Quality:{" "}
                      <span className="font-mono text-emerald-400">
                        {(data.quality * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="text-slate-400 text-[11px] mb-1 font-mono">
                      95% CI: [{(data.lower * 100).toFixed(1)}%, {(data.upper * 100).toFixed(1)}%]
                    </div>
                    <div className="text-slate-300">
                      Cost:{" "}
                      <span className="font-mono text-amber-300">${data.costUsd.toFixed(4)}</span>
                    </div>
                    <div className="text-slate-300 mb-1">
                      p95 Latency:{" "}
                      <span className="font-mono">{Math.round(data.latencyP95Ms)}ms</span>
                    </div>
                    <div className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 border border-slate-600">
                      Status: {data.status}
                    </div>
                  </div>
                );
              }}
            />
            <Legend />
            <Scatter
              name="Pareto Frontier (Non-Dominated)"
              data={frontierData}
              fill="#10b981"
              shape="circle"
            >
              <ErrorBar dataKey="errorY" width={4} strokeWidth={2} stroke="#059669" direction="y" />
            </Scatter>
            <Scatter
              name="Uncertain (Overlapping CIs)"
              data={uncertainData}
              fill="#f59e0b"
              shape="triangle"
            >
              <ErrorBar
                dataKey="errorY"
                width={4}
                strokeWidth={1.5}
                stroke="#d97706"
                direction="y"
              />
            </Scatter>
            <Scatter
              name="Dominated (Conclusively Inferior)"
              data={dominatedData}
              fill="#ef4444"
              shape="cross"
            >
              <ErrorBar dataKey="errorY" width={4} strokeWidth={1} stroke="#dc2626" direction="y" />
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
