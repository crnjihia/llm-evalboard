import type { MetricComparison } from "@evalboard/core";

interface ForestPlotProps {
  metrics: MetricComparison[];
  delta?: number;
  width?: number;
  height?: number;
}

export function ForestPlot({ metrics, delta = 0.03, width = 600 }: ForestPlotProps) {
  if (metrics.length === 0) {
    return <div className="text-sm text-slate-500 py-4">No metrics available to plot.</div>;
  }

  // Calculate global domain to ensure all CIs and the +-delta zone fit
  let minVal = -delta * 1.5;
  let maxVal = delta * 1.5;

  for (const m of metrics) {
    if (m.ci.lower < minVal) minVal = m.ci.lower * 1.2;
    if (m.ci.upper > maxVal) maxVal = m.ci.upper * 1.2;
  }

  const range = maxVal - minVal || 1;
  const paddingLeft = 140;
  const paddingRight = 140;
  const plotWidth = width - paddingLeft - paddingRight;

  const scaleX = (val: number) => {
    return paddingLeft + ((val - minVal) / range) * plotWidth;
  };

  const rowHeight = 44;
  const totalHeight = 40 + metrics.length * rowHeight;

  const zeroX = scaleX(0);
  const deltaNegX = scaleX(-delta);
  const deltaPosX = scaleX(delta);

  return (
    <div className="w-full overflow-x-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Forest Plot of Paired Differences (Candidate − Baseline)
        </h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Equivalence Band: ±{delta} (Shaded)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${totalHeight}`}
        className="w-full max-w-full h-auto text-xs"
        role="img"
        aria-label="Forest plot displaying paired differences and 95% confidence intervals against the delta equivalence band"
      >
        {/* Shaded equivalence band [-delta, +delta] */}
        <rect
          x={deltaNegX}
          y={20}
          width={Math.max(0, deltaPosX - deltaNegX)}
          height={totalHeight - 40}
          fill="currentColor"
          className="text-sky-50 dark:text-sky-950/40"
        />

        {/* Zero reference line */}
        <line
          x1={zeroX}
          y1={20}
          x2={zeroX}
          y2={totalHeight - 20}
          stroke="currentColor"
          strokeDasharray="4 4"
          className="text-slate-400 dark:text-slate-600"
        />

        {/* +-delta vertical boundaries */}
        <line
          x1={deltaNegX}
          y1={20}
          x2={deltaNegX}
          y2={totalHeight - 20}
          stroke="currentColor"
          strokeDasharray="2 2"
          className="text-sky-300 dark:text-sky-800"
        />
        <line
          x1={deltaPosX}
          y1={20}
          x2={deltaPosX}
          y2={totalHeight - 20}
          stroke="currentColor"
          strokeDasharray="2 2"
          className="text-sky-300 dark:text-sky-800"
        />

        {/* Axis labels at top */}
        <text x={zeroX} y={14} textAnchor="middle" className="fill-slate-500 font-mono text-[10px]">
          0.0
        </text>
        <text
          x={deltaNegX}
          y={14}
          textAnchor="middle"
          className="fill-sky-600 dark:fill-sky-400 font-mono text-[10px]"
        >
          -{delta}
        </text>
        <text
          x={deltaPosX}
          y={14}
          textAnchor="middle"
          className="fill-sky-600 dark:fill-sky-400 font-mono text-[10px]"
        >
          +{delta}
        </text>

        {/* Rows */}
        {metrics.map((m, idx) => {
          const y = 45 + idx * rowHeight;
          const lowerX = scaleX(m.ci.lower);
          const upperX = scaleX(m.ci.upper);
          const pointX = scaleX(m.diff);

          // Color coded circle and bar based on verdict
          let barColor = "text-slate-600 dark:text-slate-300";
          let dotColor = "text-slate-900 dark:text-slate-100";
          if (m.verdict === "BETTER") {
            barColor = "text-emerald-500";
            dotColor = "text-emerald-600 dark:text-emerald-400";
          } else if (m.verdict === "WORSE") {
            barColor = "text-rose-500";
            dotColor = "text-rose-600 dark:text-rose-400";
          } else if (m.verdict === "NO MEANINGFUL DIFFERENCE") {
            barColor = "text-sky-500";
            dotColor = "text-sky-600 dark:text-sky-400";
          }

          return (
            <g key={m.metric}>
              {/* Metric Label */}
              <text
                x={paddingLeft - 12}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-800 dark:fill-slate-200 font-medium text-xs"
              >
                {m.metric}
              </text>

              {/* Error Bar Line */}
              <line
                x1={lowerX}
                y1={y}
                x2={upperX}
                y2={y}
                stroke="currentColor"
                strokeWidth={2}
                className={barColor}
              />

              {/* Whiskers */}
              <line
                x1={lowerX}
                y1={y - 4}
                x2={lowerX}
                y2={y + 4}
                stroke="currentColor"
                strokeWidth={2}
                className={barColor}
              />
              <line
                x1={upperX}
                y1={y - 4}
                x2={upperX}
                y2={y + 4}
                stroke="currentColor"
                strokeWidth={2}
                className={barColor}
              />

              {/* Point Estimate Marker */}
              <circle cx={pointX} cy={y} r={4} fill="currentColor" className={dotColor} />

              {/* Numeric value readout on right */}
              <text
                x={width - paddingRight + 12}
                y={y + 4}
                textAnchor="start"
                className="fill-slate-600 dark:fill-slate-400 font-mono text-[11px]"
              >
                {m.diff >= 0 ? "+" : ""}
                {(m.diff * 100).toFixed(1)}% [{(m.ci.lower * 100).toFixed(1)},{" "}
                {(m.ci.upper * 100).toFixed(1)}]
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
