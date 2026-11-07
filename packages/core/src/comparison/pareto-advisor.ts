import {
  type ConfidenceIntervalResult,
  type ParetoPoint,
  computeParetoFrontier,
} from "@evalboard/stats";
import type { ParetoComparisonData, ParetoRecommendation } from "./types.js";

export interface CellParetoInput {
  cellId: string;
  cellName: string;
  costUsd: number;
  latencyP95Ms: number;
  qualityCi: ConfidenceIntervalResult;
}

/**
 * Evaluates the Cost-vs-Quality Pareto frontier and recommends the optimal arm
 * using the transparent decision rule:
 * "Cheapest arm whose quality is within delta of the best observed quality."
 */
export function evaluateParetoAndRecommend(
  cells: CellParetoInput[],
  options?: { delta?: number; qualityMetric?: string },
): ParetoComparisonData {
  const delta = options?.delta ?? 0.03;
  const qualityMetric = options?.qualityMetric ?? "Overall Quality";

  const paretoPoints: ParetoPoint[] = cells.map((c) => ({
    id: c.cellId,
    name: c.cellName,
    costUsd: c.costUsd,
    quality: {
      pointEstimate: c.qualityCi.pointEstimate,
      lower: c.qualityCi.lower,
      upper: c.qualityCi.upper,
    },
    metadata: {
      latencyP95Ms: c.latencyP95Ms,
    },
  }));

  const paretoAnalysis = computeParetoFrontier(paretoPoints);

  if (cells.length === 0) {
    return {
      qualityMetric,
      points: [],
      frontier: [],
      uncertain: [],
      dominated: [],
      recommendation: {
        recommendedCellId: "",
        recommendedCellName: "None",
        ruleExplanation: "No cells provided for comparison.",
        caveats: [],
      },
    };
  }

  // Find the highest quality arm
  let bestQualityCell = cells[0] as CellParetoInput;
  for (const c of cells) {
    if (c.qualityCi.pointEstimate > bestQualityCell.qualityCi.pointEstimate) {
      bestQualityCell = c;
    }
  }

  const qualityThreshold = bestQualityCell.qualityCi.pointEstimate - delta;

  // Filter candidates whose quality is >= threshold (not worse by more than delta)
  const acceptableCells = cells.filter((c) => c.qualityCi.pointEstimate >= qualityThreshold);

  // Pick the cheapest among acceptable cells
  let recommendedCell = acceptableCells[0] ?? bestQualityCell;
  for (const c of acceptableCells) {
    if (c.costUsd < recommendedCell.costUsd) {
      recommendedCell = c;
    } else if (
      c.costUsd === recommendedCell.costUsd &&
      c.latencyP95Ms < recommendedCell.latencyP95Ms
    ) {
      recommendedCell = c;
    }
  }

  const caveats: string[] = [];
  if (recommendedCell.cellId !== bestQualityCell.cellId) {
    const qualityGap =
      bestQualityCell.qualityCi.pointEstimate - recommendedCell.qualityCi.pointEstimate;
    const costSavingsPct =
      bestQualityCell.costUsd > 0
        ? Math.round(
            ((bestQualityCell.costUsd - recommendedCell.costUsd) / bestQualityCell.costUsd) * 100,
          )
        : 0;

    caveats.push(
      `Quality point estimate is ${qualityGap.toFixed(3)} pts lower than top-scoring arm '${bestQualityCell.cellName}', but saves ~${costSavingsPct}% in evaluation/generation cost.`,
    );

    if (recommendedCell.qualityCi.lower < qualityThreshold) {
      caveats.push(
        `Confidence interval lower bound (${recommendedCell.qualityCi.lower.toFixed(3)}) extends below the delta tolerance (${qualityThreshold.toFixed(3)}). Additional testing recommended to confirm equivalence.`,
      );
    }
  }

  if (recommendedCell.latencyP95Ms > 2000) {
    caveats.push(
      `p95 latency is high (${Math.round(recommendedCell.latencyP95Ms)}ms); verify production latency requirements before deploying.`,
    );
  }

  const recommendation: ParetoRecommendation = {
    recommendedCellId: recommendedCell.cellId,
    recommendedCellName: recommendedCell.cellName,
    ruleExplanation:
      recommendedCell.cellId === bestQualityCell.cellId
        ? `Selected '${recommendedCell.cellName}' as the highest-performing arm with top quality score (${recommendedCell.qualityCi.pointEstimate.toFixed(3)}).`
        : `Selected '${recommendedCell.cellName}' as the cheapest arm within delta (${delta}) of top quality score (${bestQualityCell.qualityCi.pointEstimate.toFixed(3)}).`,
    caveats,
  };

  return {
    qualityMetric,
    points: paretoAnalysis.allPoints,
    frontier: paretoAnalysis.frontier,
    uncertain: paretoAnalysis.uncertain,
    dominated: paretoAnalysis.dominated,
    recommendation,
  };
}
