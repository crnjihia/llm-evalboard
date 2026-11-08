import type { RedteamRepository } from "@evalboard/db";
import { AdaptiveAttacker, type ModelInvoker } from "./attacker.js";
import { computeRedteamMetrics } from "./scoring.js";
import { getAllProbes } from "./taxonomy.js";
import type { ProbeEvaluationResult, RedteamReport, RunRedteamOptions } from "./types.js";

export class RedteamEngine {
  constructor(
    private readonly invoker: ModelInvoker,
    private readonly redteamRepo?: RedteamRepository,
  ) {}

  async runSuite(options: RunRedteamOptions = {}): Promise<RedteamReport> {
    const model = options.model ?? "target-model";
    let probes = getAllProbes();

    if (options.categories && options.categories.length > 0) {
      const selectedCategories = new Set(options.categories);
      probes = probes.filter((p) => selectedCategories.has(p.category));
    }

    const attacker = new AdaptiveAttacker(this.invoker);
    const results: ProbeEvaluationResult[] = [];

    for (const probe of probes) {
      const result = await attacker.executeProbe(probe, {
        maxTurns: options.maxTurns,
        systemPrompt: options.systemPrompt,
        targetSecret: options.targetSecret ?? probe.targetSecret,
      });
      results.push(result);
    }

    const report = computeRedteamMetrics(model, results);

    if (options.save && this.redteamRepo) {
      await this.redteamRepo.saveRun({
        projectId: options.projectId,
        targetPromptVersionId: options.targetPromptVersionId,
        modelConfig: {
          model,
        },
        asr: report.asr,
        ciLower: report.ciLower,
        ciUpper: report.ciUpper,
        totalAttacks: report.attackProbesCount,
        successfulAttacks: report.successfulAttacksCount,
        categoryBreakdown: report.categoryBreakdown,
        overRefusalRate: report.overRefusalRate,
      });
    }

    return report;
  }

  static formatConsoleReport(report: RedteamReport): string {
    const lines: string[] = [];
    lines.push("\n============================================================");
    lines.push(`RED-TEAM SECURITY ASSESSMENT REPORT (${report.model})`);
    lines.push("============================================================");
    lines.push(
      `Overall Attack Success Rate (ASR): ${(report.asr * 100).toFixed(1)}% [${(report.ciLower * 100).toFixed(1)}%, ${(report.ciUpper * 100).toFixed(1)}%] (95% Wilson CI)`,
    );
    lines.push(`Total Attack Probes Tested:        ${report.attackProbesCount}`);
    lines.push(`Attacks Succeeded (Breached):      ${report.successfulAttacksCount}`);
    lines.push(`Security Score:                    ${(report.securityScore * 100).toFixed(1)}%`);
    lines.push("------------------------------------------------------------");
    lines.push(
      `Over-Refusal Rate (ORR):           ${(report.overRefusalRate * 100).toFixed(1)}% (${report.falseRefusalsCount}/${report.overRefusalProbesCount} false refusals)`,
    );
    lines.push(`Utility Score:                     ${(report.utilityScore * 100).toFixed(1)}%`);
    lines.push("------------------------------------------------------------");
    lines.push("CATEGORY BREAKDOWN:");
    lines.push(`${"Category".padEnd(24)}${"Breached / Total".padEnd(20)}${"ASR [95% CI]"}`);
    for (const [cat, data] of Object.entries(report.categoryBreakdown)) {
      const isOR = cat === "OVER_REFUSAL_PROBE";
      const metricLabel = isOR ? "ORR" : "ASR";
      const countStr = `${data.successful} / ${data.total}`;
      const ciStr = `${metricLabel}: ${(data.asr * 100).toFixed(1)}% [${(data.ciLower * 100).toFixed(1)}%, ${(data.ciUpper * 100).toFixed(1)}%]`;
      lines.push(`${cat.padEnd(24)}${countStr.padEnd(20)}${ciStr}`);
    }
    lines.push("------------------------------------------------------------");
    lines.push("DETAILED PROBE RESULTS:");
    for (const res of report.probeResults) {
      const status =
        res.category === "OVER_REFUSAL_PROBE"
          ? res.refused
            ? "[FALSE REFUSAL]"
            : "[FULFILLED]"
          : res.attackSucceeded
            ? "[BREACHED]"
            : "[DEFENDED]";
      lines.push(`  * ${status.padEnd(18)} ${res.probeName} (Turns: ${res.turnsExecuted})`);
      lines.push(`    Reason: ${res.reasoning}`);
    }
    lines.push("============================================================\n");
    return lines.join("\n");
  }
}
