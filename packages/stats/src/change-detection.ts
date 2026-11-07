import { mean, standardDeviation } from "./descriptives.js";

export interface TimeSeriesPoint {
  runId: string;
  timestamp: string | Date;
  value: number;
}

export interface EwmaOptions {
  lambda?: number; // Smoothing factor, default 0.20
  controlLimitSigma?: number; // Multiplier L for control limits, default 3.0
  baselineWindowSize?: number; // Initial runs used for baseline calibration, default 5
  higherIsBetter?: boolean; // Default true
}

export interface EwmaPoint {
  runId: string;
  timestamp: string | Date;
  raw: number;
  ewma: number;
  lcl: number;
  ucl: number;
  isAnomaly: boolean;
  severity: "none" | "warning" | "critical";
}

export interface ChangeDetectionResult {
  hasAlert: boolean;
  maxSeverity: "none" | "warning" | "critical";
  baselineMean: number;
  baselineStd: number;
  points: EwmaPoint[];
  anomalies: EwmaPoint[];
}

/**
 * Exponentially Weighted Moving Average (EWMA) control chart for detecting
 * subtle persistent shifts and sudden regressions in model performance over time.
 */
export function detectRegressionsEwma(
  history: TimeSeriesPoint[],
  options?: EwmaOptions,
): ChangeDetectionResult {
  const lambda = options?.lambda ?? 0.2;
  const L = options?.controlLimitSigma ?? 3.0;
  const baselineWindow = Math.max(2, options?.baselineWindowSize ?? 5);
  const higherIsBetter = options?.higherIsBetter ?? true;

  if (history.length === 0) {
    return {
      hasAlert: false,
      maxSeverity: "none",
      baselineMean: 0,
      baselineStd: 0,
      points: [],
      anomalies: [],
    };
  }

  // Calibration phase: use the first baselineWindow observations (or all if history < baselineWindow)
  const calibrationSlice = history.slice(0, Math.min(baselineWindow, history.length));
  const calibrationValues = calibrationSlice.map((p) => p.value);
  const baselineMean = mean(calibrationValues);
  const sampleStd = standardDeviation(calibrationValues, 1);
  // Guarantee a non-zero minimal standard deviation to avoid infinite precision on identical runs
  const baselineStd = Math.max(0.01, sampleStd);

  let currentZ = baselineMean;
  const points: EwmaPoint[] = [];
  const anomalies: EwmaPoint[] = [];
  let maxSeverity: "none" | "warning" | "critical" = "none";

  for (let t = 1; t <= history.length; t++) {
    const pt = history[t - 1];
    if (!pt) continue;

    currentZ = lambda * pt.value + (1 - lambda) * currentZ;

    // Time-varying exact variance of EWMA: sigma^2 * (lambda / (2 - lambda)) * (1 - (1 - lambda)^(2t))
    const factor = (lambda / (2 - lambda)) * (1 - (1 - lambda) ** (2 * t));
    const sigmaZ = baselineStd * Math.sqrt(Math.max(0, factor));

    const ucl = baselineMean + L * sigmaZ;
    const lcl = baselineMean - L * sigmaZ;
    const warningUcl = baselineMean + 2.0 * sigmaZ;
    const warningLcl = baselineMean - 2.0 * sigmaZ;

    let isAnomaly = false;
    let severity: "none" | "warning" | "critical" = "none";

    if (higherIsBetter) {
      if (currentZ < lcl) {
        isAnomaly = true;
        severity = "critical";
      } else if (currentZ < warningLcl) {
        isAnomaly = true;
        severity = "warning";
      }
    } else {
      // Lower is better (e.g. error rate, attack success rate)
      if (currentZ > ucl) {
        isAnomaly = true;
        severity = "critical";
      } else if (currentZ > warningUcl) {
        isAnomaly = true;
        severity = "warning";
      }
    }

    if (severity === "critical") {
      maxSeverity = "critical";
    } else if (severity === "warning" && maxSeverity !== "critical") {
      maxSeverity = "warning";
    }

    const evaluatedPoint: EwmaPoint = {
      runId: pt.runId,
      timestamp: pt.timestamp,
      raw: pt.value,
      ewma: currentZ,
      lcl,
      ucl,
      isAnomaly,
      severity,
    };

    points.push(evaluatedPoint);
    if (isAnomaly) {
      anomalies.push(evaluatedPoint);
    }
  }

  return {
    hasAlert: anomalies.length > 0,
    maxSeverity,
    baselineMean,
    baselineStd,
    points,
    anomalies,
  };
}
