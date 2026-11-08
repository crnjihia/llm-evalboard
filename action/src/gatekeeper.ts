import type { ComparisonVerdict } from "@evalboard/stats";
import type { GatingPolicy, GatingResult } from "./types.js";

/**
 * Evaluates whether a pull request comparison passes the CI merge gate.
 */
export function evaluateMergeGate(verdict: ComparisonVerdict, policy: GatingPolicy): GatingResult {
  if (verdict === "WORSE" && policy.failOnRegression) {
    return {
      passed: false,
      exitCode: 1,
      verdict,
      reason:
        "Merge gate blocked: Candidate exhibits a statistically significant performance regression (verdict is WORSE).",
    };
  }

  if (verdict === "INCONCLUSIVE" && policy.failOnInconclusive) {
    return {
      passed: false,
      exitCode: 1,
      verdict,
      reason:
        "Merge gate blocked: Evaluation verdict is INCONCLUSIVE (sample size insufficient or variance too high to confirm parity/improvement).",
    };
  }

  if (verdict === "BETTER") {
    return {
      passed: true,
      exitCode: 0,
      verdict,
      reason:
        "Merge gate passed: Candidate demonstrated a statistically verified improvement (verdict is BETTER).",
    };
  }

  if (verdict === "NO MEANINGFUL DIFFERENCE") {
    return {
      passed: true,
      exitCode: 0,
      verdict,
      reason:
        "Merge gate passed: Candidate is statistically equivalent to baseline within the tolerance margin (verdict is NO MEANINGFUL DIFFERENCE).",
    };
  }

  // If inconclusive and failOnInconclusive is false:
  return {
    passed: true,
    exitCode: 0,
    verdict,
    reason:
      "Merge gate warning: Evaluation verdict is INCONCLUSIVE, but policy permits merge without hard failure.",
  };
}
