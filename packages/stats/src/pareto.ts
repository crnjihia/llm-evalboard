export interface ParetoPoint {
  id: string;
  name: string;
  costUsd: number;
  quality: {
    pointEstimate: number;
    lower: number;
    upper: number;
  };
  metadata?: Record<string, unknown>;
}

export type ParetoStatus = "ON_FRONTIER" | "UNCERTAIN" | "DOMINATED";

export interface EvaluatedParetoPoint extends ParetoPoint {
  status: ParetoStatus;
  dominatedBy: string[];
}

export interface ParetoAnalysisResult {
  frontier: EvaluatedParetoPoint[];
  uncertain: EvaluatedParetoPoint[];
  dominated: EvaluatedParetoPoint[];
  allPoints: EvaluatedParetoPoint[];
}

/**
 * Computes the Cost-vs-Quality Pareto frontier taking confidence intervals into account (ADR-004).
 *
 * Dominance Rules under Statistical Uncertainty:
 * 1. Definitive / Strict Dominance:
 *    Point A strictly dominates Point B if:
 *    - Cost_A <= Cost_B AND LowerBound_A >= UpperBound_B (with at least one strict inequality).
 *    Point B is definitely inferior even under worst-case realization.
 *
 * 2. Point-Estimate Dominance (Plunging into UNCERTAIN):
 *    If Cost_A <= Cost_B and PointEstimate_A > PointEstimate_B, but their CIs overlap
 *    (LowerBound_A < UpperBound_B), Point B cannot be definitively ruled out, but is marked UNCERTAIN.
 *
 * 3. Non-dominated Points:
 *    Points where no cheaper point achieves comparable or higher quality remain ON_FRONTIER.
 */
export function computeParetoFrontier(points: ParetoPoint[]): ParetoAnalysisResult {
  if (points.length === 0) {
    return { frontier: [], uncertain: [], dominated: [], allPoints: [] };
  }

  const evaluated: EvaluatedParetoPoint[] = points.map((p) => ({
    ...p,
    status: "ON_FRONTIER",
    dominatedBy: [],
  }));

  for (let i = 0; i < evaluated.length; i++) {
    const current = evaluated[i];
    if (!current) continue;

    for (let j = 0; j < evaluated.length; j++) {
      if (i === j) continue;
      const other = evaluated[j];
      if (!other) continue;

      const cheaperOrEqual = other.costUsd <= current.costUsd;
      const strictlyCheaper = other.costUsd < current.costUsd;

      // Check strict dominance: other is cheaper and other's lower bound is at or above current's upper bound
      const strictlyHigherQuality = other.quality.lower >= current.quality.upper;
      const pointEstimateHigher = other.quality.pointEstimate > current.quality.pointEstimate;

      if (
        (strictlyCheaper && strictlyHigherQuality) ||
        (cheaperOrEqual && other.quality.lower > current.quality.upper)
      ) {
        current.dominatedBy.push(other.id);
        current.status = "DOMINATED";
      } else if (cheaperOrEqual && pointEstimateHigher && current.status !== "DOMINATED") {
        // Point estimate is worse for equal/higher cost, but CI overlaps
        current.status = "UNCERTAIN";
      }
    }
  }

  const frontier = evaluated.filter((p) => p.status === "ON_FRONTIER");
  const uncertain = evaluated.filter((p) => p.status === "UNCERTAIN");
  const dominated = evaluated.filter((p) => p.status === "DOMINATED");

  return {
    frontier,
    uncertain,
    dominated,
    allPoints: evaluated,
  };
}
