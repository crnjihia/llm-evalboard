import type { CellResourceUsage, MetricComparison, SliceResult } from "./types.js";

export interface SummaryGeneratorInput {
  baselineName: string;
  candidateName: string;
  metrics: MetricComparison[];
  usage?: {
    baseline: CellResourceUsage;
    candidate: CellResourceUsage;
  };
  simpsonsAnomalies?: SliceResult[];
}

/**
 * Generates an executive summary paragraph using deterministic string templates (NOT an LLM).
 * Accurately communicates statistical findings, confidence intervals, effect sizes, costs, and Simpson's alerts.
 */
export function generateExecutiveSummary(input: SummaryGeneratorInput): string {
  const { baselineName, candidateName, metrics, usage, simpsonsAnomalies } = input;

  if (metrics.length === 0) {
    return `Comparison between '${candidateName}' and '${baselineName}' contains no evaluated metrics.`;
  }

  // 1. Metric clauses
  const metricClauses: string[] = [];

  for (const m of metrics) {
    const diffPts = (m.diff * 100).toFixed(1);
    const sign = m.diff > 0 ? "+" : "";
    const pct = Math.round(m.ci.confidence * 100);
    const lowerPts = (m.ci.lower * 100).toFixed(1);
    const upperPts = (m.ci.upper * 100).toFixed(1);
    const deltaPts = (m.delta * 100).toFixed(1);

    switch (m.verdict) {
      case "BETTER":
        metricClauses.push(
          `${candidateName} is better than ${baselineName} on ${m.metric} (${sign}${diffPts} pts, ${pct}% CI [${lowerPts}, ${upperPts}], δ = ${deltaPts} pts)`,
        );
        break;
      case "WORSE":
        metricClauses.push(
          `${candidateName} is worse than ${baselineName} on ${m.metric} (${diffPts} pts, ${pct}% CI [${lowerPts}, ${upperPts}], δ = ${deltaPts} pts)`,
        );
        break;
      case "NO MEANINGFUL DIFFERENCE":
        metricClauses.push(
          `${candidateName} shows no meaningful difference compared to ${baselineName} on ${m.metric} (${sign}${diffPts} pts, ${pct}% CI [${lowerPts}, ${upperPts}], δ = ${deltaPts} pts)`,
        );
        break;
      case "INCONCLUSIVE": {
        const estCases = m.estimatedAdditionalCases ?? 0;
        const estClause = estCases > 0 ? `; estimated ${estCases} more cases needed` : "";
        metricClauses.push(
          `${candidateName} vs ${baselineName} on ${m.metric} is inconclusive (${sign}${diffPts} pts, ${pct}% CI [${lowerPts}, ${upperPts}], δ = ${deltaPts} pts${estClause})`,
        );
        break;
      }
    }
  }

  let metricText = "";
  if (metricClauses.length === 1) {
    metricText = `${metricClauses[0]}.`;
  } else if (metricClauses.length === 2) {
    metricText = `${metricClauses[0]} and ${metricClauses[1]}.`;
  } else {
    metricText = `${metricClauses.slice(0, -1).join(", ")}, and ${metricClauses[metricClauses.length - 1]}.`;
  }

  // 2. Resource usage clause
  let usageText = "";
  if (usage) {
    const baseCost = usage.baseline.costPer1kCasesUsd;
    const candCost = usage.candidate.costPer1kCasesUsd;
    const p95 = Math.round(usage.candidate.latencyP95Ms);

    if (baseCost > 0 && Math.abs(baseCost - candCost) > 0.0001) {
      const diffPct = Math.round((Math.abs(candCost - baseCost) / baseCost) * 100);
      if (candCost < baseCost) {
        usageText = ` ${candidateName} costs ${diffPct}% less ($${candCost.toFixed(2)} vs $${baseCost.toFixed(2)} per 1k cases) with a p95 latency of ${p95}ms.`;
      } else {
        usageText = ` ${candidateName} costs ${diffPct}% more ($${candCost.toFixed(2)} vs $${baseCost.toFixed(2)} per 1k cases) with a p95 latency of ${p95}ms.`;
      }
    } else {
      usageText = ` ${candidateName} costs $${candCost.toFixed(2)} per 1k cases with a p95 latency of ${p95}ms.`;
    }
  }

  // 3. Simpson's Paradox Warning
  let simpsonsText = "";
  if (simpsonsAnomalies && simpsonsAnomalies.length > 0) {
    const anomalyDetails = simpsonsAnomalies
      .slice(0, 2)
      .map((a) => {
        const sign = a.diff > 0 ? "+" : "";
        const pts = (a.diff * 100).toFixed(1);
        return `'${a.sliceKey}=${a.sliceValue}' (${sign}${pts} pts)`;
      })
      .join(", ");

    simpsonsText = ` Caution: Simpson's paradox detected in slice ${anomalyDetails}, directly contradicting the overall evaluation trajectory.`;
  }

  return `${metricText}${usageText}${simpsonsText}`.trim();
}
