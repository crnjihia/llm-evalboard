import {
  type BootstrapCI,
  type LengthBiasReport,
  bootstrapKappaCI,
  computeCohenKappa,
  computeLengthBias,
} from "@evalboard/stats";
import { type JudgeTrustBadge, getJudgeTrustBadge } from "./badge.js";

export interface CalibrationPair<T = string | number> {
  humanLabel: T;
  judgeLabel: T;
  outputLength?: number;
  output?: string;
  criterion: string;
}

export interface CalibrationReport<T = string | number> {
  graderVersionId: string;
  criterion: string;
  sampleSize: number;
  rawAgreement: number;
  kappa: number;
  kappaCI: BootstrapCI;
  confusionMatrix: number[][];
  categories: T[];
  badge: JudgeTrustBadge;
  lengthBias: LengthBiasReport;
  verdict: "TRUSTED" | "USE_WITH_CAUTION" | "NOT_TRUSTED";
  verdictExplanation: string;
}

export interface GenerateCalibrationReportOptions<T = string | number> {
  graderVersionId: string;
  criterion: string;
  pairs: CalibrationPair<T>[];
  categories?: T[];
  weights?: "unweighted" | "linear" | "quadratic";
  seed?: number | string;
}

/**
 * Computes calibration statistics and returns a structured CalibrationReport.
 */
export function generateCalibrationReport<T = string | number>(
  options: GenerateCalibrationReportOptions<T>,
): CalibrationReport<T> {
  const { graderVersionId, criterion, pairs, categories, weights = "linear", seed = 42 } = options;

  const human = pairs.map((p) => p.humanLabel);
  const judge = pairs.map((p) => p.judgeLabel);

  const kappaResult = computeCohenKappa(human, judge, { categories, weights });
  const kappaCI = bootstrapKappaCI(human, judge, {
    categories,
    weights,
    seed,
    numResamples: 1000,
  });

  const lengths = pairs.map((p) => p.outputLength ?? p.output?.length ?? 100);
  const judgeScoresAsNumbers = judge.map((j) => (typeof j === "number" ? j : 1));
  const lengthBias = computeLengthBias(lengths, judgeScoresAsNumbers);

  const badge = getJudgeTrustBadge({
    sampleSize: pairs.length,
    kappa: kappaResult.kappa,
    graderVersionId,
  });

  let verdict: "TRUSTED" | "USE_WITH_CAUTION" | "NOT_TRUSTED";
  let verdictExplanation: string;

  if (kappaResult.kappa >= 0.7) {
    verdict = "TRUSTED";
    verdictExplanation = `Judge demonstrates strong statistical agreement with human raters (Cohen's κ = ${kappaResult.kappa.toFixed(2)} [95% CI: ${kappaCI.lower.toFixed(2)} to ${kappaCI.upper.toFixed(2)}]). Scores can be trusted as authoritative benchmarks.`;
  } else if (kappaResult.kappa >= 0.4) {
    verdict = "USE_WITH_CAUTION";
    verdictExplanation = `Judge demonstrates moderate agreement with human raters (Cohen's κ = ${kappaResult.kappa.toFixed(2)} [95% CI: ${kappaCI.lower.toFixed(2)} to ${kappaCI.upper.toFixed(2)}]). Use for directional feedback but do not base critical decisions on minor differences.`;
  } else {
    verdict = "NOT_TRUSTED";
    verdictExplanation = `Judge demonstrates poor agreement with human raters (Cohen's κ = ${kappaResult.kappa.toFixed(2)} [95% CI: ${kappaCI.lower.toFixed(2)} to ${kappaCI.upper.toFixed(2)}]). Verdicts are dominated by judge noise or misalignment.`;
  }

  return {
    graderVersionId,
    criterion,
    sampleSize: pairs.length,
    rawAgreement: kappaResult.rawAgreement,
    kappa: kappaResult.kappa,
    kappaCI,
    confusionMatrix: kappaResult.confusionMatrix,
    categories: kappaResult.categories,
    badge,
    lengthBias,
    verdict,
    verdictExplanation,
  };
}

/**
 * Formats a CalibrationReport into markdown.
 */
export function formatCalibrationReportMarkdown<T = string | number>(
  report: CalibrationReport<T>,
): string {
  const lines: string[] = [
    `# Judge Calibration Report: ${report.criterion}`,
    "",
    `**Grader Version:** \`${report.graderVersionId}\``,
    `**Verdict:** **${report.verdict}** (${report.badge.badgeText})`,
    `**Summary:** ${report.verdictExplanation}`,
    "",
    "## Agreement Statistics",
    "| Metric | Value | 95% Confidence Interval |",
    "|---|---|---|",
    `| **Raw Agreement (Po)** | ${(report.rawAgreement * 100).toFixed(1)}% | - |`,
    `| **Cohen's Kappa (κ)** | **${report.kappa.toFixed(3)}** | [${report.kappaCI.lower.toFixed(3)}, ${report.kappaCI.upper.toFixed(3)}] |`,
    `| **Sample Size (N)** | ${report.sampleSize} items | - |`,
    "",
    "## Length Bias Analysis",
    `**Result:** ${report.lengthBias.explanation}`,
    "",
    "## Confusion Matrix",
    `Categories: [${report.categories.map((c) => String(c)).join(", ")}]`,
    "",
    "```",
    "          Judge ->",
    `Human v   ${report.categories.map((c) => String(c).padStart(4)).join(" ")}`,
  ];

  for (let i = 0; i < report.categories.length; i++) {
    const cat = String(report.categories[i]).padEnd(8);
    const row = report.confusionMatrix[i]?.map((val) => String(val).padStart(4)).join(" ") ?? "";
    lines.push(`${cat} ${row}`);
  }

  lines.push("```");
  lines.push("");

  return lines.join("\n");
}
