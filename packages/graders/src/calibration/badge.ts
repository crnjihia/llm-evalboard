export type JudgeTrustLevel = "TRUSTED" | "USE_WITH_CAUTION" | "NOT_TRUSTED" | "UNCALIBRATED";

export interface JudgeTrustBadge {
  level: JudgeTrustLevel;
  badgeText: string;
  badgeClass: string;
  colorHex: string;
  description: string;
  kappa?: number;
  reportUrl?: string;
}

/**
 * Returns a visual trust badge metadata object for an LLM judge based on calibration data.
 */
export function getJudgeTrustBadge(calibration?: {
  sampleSize: number;
  kappa: number;
  graderVersionId?: string;
}): JudgeTrustBadge {
  if (!calibration || calibration.sampleSize < 10) {
    return {
      level: "UNCALIBRATED",
      badgeText: "Uncalibrated Judge",
      badgeClass: "badge-uncalibrated bg-zinc-200 text-zinc-800 border-zinc-300",
      colorHex: "#71717a",
      description:
        "This metric is scored by an uncalibrated LLM judge. Human agreement has not yet been measured.",
    };
  }

  const kappa = calibration.kappa;

  if (kappa >= 0.7) {
    return {
      level: "TRUSTED",
      badgeText: `Trusted Judge (κ = ${kappa.toFixed(2)})`,
      badgeClass: "badge-trusted bg-emerald-100 text-emerald-800 border-emerald-300",
      colorHex: "#10b981",
      description: `High agreement with human evaluators (Cohen's κ = ${kappa.toFixed(2)} ≥ 0.70). Reliable metric.`,
      kappa,
    };
  }

  if (kappa >= 0.4) {
    return {
      level: "USE_WITH_CAUTION",
      badgeText: `Caution (κ = ${kappa.toFixed(2)})`,
      badgeClass: "badge-caution bg-amber-100 text-amber-800 border-amber-300",
      colorHex: "#f59e0b",
      description: `Moderate agreement with human evaluators (Cohen's κ = ${kappa.toFixed(2)} between 0.40 and 0.69). Treat verdicts with caution.`,
      kappa,
    };
  }

  return {
    level: "NOT_TRUSTED",
    badgeText: `Untrusted Judge (κ = ${kappa.toFixed(2)})`,
    badgeClass: "badge-not-trusted bg-rose-100 text-rose-800 border-rose-300",
    colorHex: "#ef4444",
    description: `Poor agreement with human evaluators (Cohen's κ = ${kappa.toFixed(2)} < 0.40). Metric is dominated by judge noise or misalignment.`,
    kappa,
  };
}
