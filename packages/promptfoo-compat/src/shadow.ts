import { normaliseModelConfig, renderTemplateString } from "@evalboard/core";
import { type Grader, createGrader, registerCustomGrader } from "@evalboard/graders";
import { type Provider, createProvider } from "@evalboard/providers";
import {
  type ConfidenceIntervalResult,
  type VerdictResult,
  analyzePairedDifferences,
  bootstrapConfidenceInterval,
  determineVerdict,
  mean,
  standardDeviation,
  variance,
  wilsonScoreInterval,
} from "@evalboard/stats";
import { importPromptfooConfig } from "./importer.js";
import { mapPromptfooAssertion } from "./mapping.js";
import { PerformanceGrader } from "./performance.js";
import type { PromptfooConfig, PromptfooTestCase } from "./schema.js";
import { SimilarityGrader } from "./similarity.js";
import type { MappingWarning } from "./warnings.js";

// Ensure custom graders are registered
registerCustomGrader("similar", (config) => new SimilarityGrader(config));
registerCustomGrader("performance-cost", (config) => new PerformanceGrader(config));
registerCustomGrader("performance-latency", (config) => new PerformanceGrader(config));

export interface ShadowRunOptions {
  repeats?: number;
  model?: string;
  baselineModel?: string;
  seed?: number;
  delta?: number;
  providerResolver?: (provider: string, model: string) => Provider;
  customProvider?: Provider;
  customBaselineProvider?: Provider;
  resolvedPrompts?: string[];
}

export interface FalsePassDetail {
  caseIndex: number;
  description?: string;
  turn1Result: boolean;
  repeatPassRate: number;
  failureCount: number;
  totalRepeats: number;
  sampleOutput: string;
}

export interface ShadowCaseExecution {
  caseIndex: number;
  description?: string;
  vars: Record<string, unknown>;
  promptfooRepeatPasses: boolean[];
  evalboardRepeatScores: number[];
  baselineRepeatScores?: number[];
  sampleOutput: string;
}

export interface ShadowReport {
  model: string;
  baselineModel?: string;
  totalCases: number;
  repeats: number;
  promptfooPassRate: number;
  promptfooCi: ConfidenceIntervalResult;
  evalboardPassRate: number;
  evalboardCi: ConfidenceIntervalResult;
  evalboardMeanScore: number;
  evalboardScoreCi: ConfidenceIntervalResult;
  scoreVariance: number;
  scoreStdDev: number;
  falsePassCount: number;
  falsePassRate: number;
  falsePasses: FalsePassDetail[];
  verdict?: VerdictResult;
  executions: ShadowCaseExecution[];
  warnings: MappingWarning[];
  durationMs: number;
}

/**
 * ShadowRunner runs Promptfoo tests through Evalboard's repeated stochastic execution
 * to expose hidden variance, false passes, and paired statistical verdicts.
 */
export class ShadowRunner {
  constructor(private readonly config: PromptfooConfig) {}

  public async run(options: ShadowRunOptions = {}): Promise<ShadowReport> {
    const startTime = Date.now();
    const repeats = Math.max(1, options.repeats ?? 3);
    const delta = options.delta ?? 0.03;

    // 1. Import config into Evalboard suite and cases
    const importResult = importPromptfooConfig(this.config, {
      repeats,
      delta,
      resolvedPrompts: options.resolvedPrompts,
    });

    const targetModelString =
      options.model ??
      (importResult.suite.models[0]
        ? `${importResult.suite.models[0].provider}:${importResult.suite.models[0].model}`
        : "mock:echo");

    const targetModelConfig = normaliseModelConfig(targetModelString);

    const provider: Provider =
      options.customProvider ??
      (options.providerResolver
        ? options.providerResolver(targetModelConfig.provider, targetModelConfig.model)
        : createProvider(targetModelConfig));

    let baselineProvider: Provider | undefined;
    let baselineModelConfig: ReturnType<typeof normaliseModelConfig> | undefined;

    if (options.baselineModel) {
      baselineModelConfig = normaliseModelConfig(options.baselineModel);
      baselineProvider =
        options.customBaselineProvider ??
        (options.providerResolver
          ? options.providerResolver(baselineModelConfig.provider, baselineModelConfig.model)
          : createProvider(baselineModelConfig));
    }

    // 2. Prepare test cases and graders
    const tests: PromptfooTestCase[] = Array.isArray(this.config.tests) ? this.config.tests : [];
    const defaultAssert = this.config.defaultTest?.assert ?? [];
    const defaultVars = this.config.defaultTest?.vars ?? {};

    const promptTemplate =
      options.resolvedPrompts?.[0] ??
      (typeof this.config.prompts[0] === "string"
        ? this.config.prompts[0]
        : ((this.config.prompts[0] as { raw?: string })?.raw ?? "{{input}}"));

    const caseExecutions: ShadowCaseExecution[] = [];
    const candidateCaseScores: number[] = [];
    const baselineCaseScores: number[] = [];

    // Pre-create graders for each test case
    const caseGraders: Array<Array<{ grader: Grader; assertion: unknown }>> = [];
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      if (!t) continue;
      const asserts = [...defaultAssert, ...(t.assert ?? [])];
      const gradersForCase: Array<{ grader: Grader; assertion: unknown }> = [];

      for (const a of asserts) {
        const { grader: gConfig } = mapPromptfooAssertion(a, i);
        if (gConfig) {
          try {
            const graderInstance = createGrader(gConfig.type, gConfig.config);
            gradersForCase.push({ grader: graderInstance, assertion: a });
          } catch {
            // If custom grader not directly creatable, fallback
          }
        }
      }
      caseGraders.push(gradersForCase);
    }

    for (let i = 0; i < tests.length; i++) {
      const test = tests[i];
      if (!test) continue;
      const mergedVars = { ...defaultVars, ...test.vars };
      const graders = caseGraders[i] ?? [];

      const renderedPrompt = renderTemplateString(promptTemplate, mergedVars, { strict: false });

      const promptfooPasses: boolean[] = [];
      const evalboardScores: number[] = [];
      const baselineScores: number[] = [];
      let lastOutput = "";

      for (let r = 0; r < repeats; r++) {
        // Stochastic repeat execution
        const callStart = Date.now();
        const response = await provider.generate({
          model: targetModelConfig.model,
          messages: [{ role: "user", content: renderedPrompt }],
          params: {
            temperature: targetModelConfig.parameters?.temperature ?? (r > 0 ? 0.7 : 0.0),
            seed: (options.seed ?? 42) + r * 1000 + i,
          },
        });
        const latencyMs = Date.now() - callStart;
        const output = response.text ?? "";
        lastOutput = output;

        // Context for performance graders
        const gradeContext = {
          latencyMs,
          costUsd: response.usage?.costUsd ?? 0,
        };

        // Grade with evalboard graders
        let caseRepeatScore = 1.0;
        let caseAllPassed = true;

        if (graders.length > 0) {
          let sumScore = 0;
          for (const { grader } of graders) {
            const outcome = await grader.grade({
              case: {
                id: `case_${i}`,
                input: mergedVars,
                expected: mergedVars.expected,
              },
              output,
              context: gradeContext,
            });
            sumScore += outcome.score;
            if (!outcome.pass) {
              caseAllPassed = false;
            }
          }
          caseRepeatScore = sumScore / graders.length;
        } else {
          // If no assertions, default pass
          caseAllPassed = true;
          caseRepeatScore = 1.0;
        }

        promptfooPasses.push(caseAllPassed);
        evalboardScores.push(caseRepeatScore);

        // Baseline comparison if baselineModel is provided
        if (baselineProvider && baselineModelConfig) {
          const bResponse = await baselineProvider.generate({
            model: baselineModelConfig.model,
            messages: [{ role: "user", content: renderedPrompt }],
            params: {
              temperature: baselineModelConfig.parameters?.temperature ?? (r > 0 ? 0.7 : 0.0),
              seed: (options.seed ?? 42) + r * 1000 + i,
            },
          });
          const bOutput = bResponse.text ?? "";
          let bScore = 1.0;

          if (graders.length > 0) {
            let bSum = 0;
            for (const { grader } of graders) {
              const bOutcome = await grader.grade({
                case: {
                  id: `case_${i}`,
                  input: mergedVars,
                  expected: mergedVars.expected,
                },
                output: bOutput,
              });
              bSum += bOutcome.score;
            }
            bScore = bSum / graders.length;
          }
          baselineScores.push(bScore);
        }
      }

      // Mean score for this case
      const avgCandidateCaseScore = mean(evalboardScores);
      candidateCaseScores.push(avgCandidateCaseScore);

      if (baselineScores.length > 0) {
        baselineCaseScores.push(mean(baselineScores));
      }

      caseExecutions.push({
        caseIndex: i,
        description: test.description,
        vars: mergedVars,
        promptfooRepeatPasses: promptfooPasses,
        evalboardRepeatScores: evalboardScores,
        baselineRepeatScores: baselineScores.length > 0 ? baselineScores : undefined,
        sampleOutput: lastOutput,
      });
    }

    // 3. Compute Metrics
    const totalCases = caseExecutions.length;

    // Promptfoo Single-Run (Turn 1) Pass Rate
    const turn1Passes = caseExecutions.filter((c) => c.promptfooRepeatPasses[0] === true).length;
    const promptfooPassRate = totalCases > 0 ? turn1Passes / totalCases : 0;
    const promptfooCi = wilsonScoreInterval(turn1Passes, totalCases, 0.95);

    // Evalboard Stochastic Pass Rate across all repeats
    let totalAllPasses = 0;
    const allScores: number[] = [];
    for (const c of caseExecutions) {
      for (let r = 0; r < repeats; r++) {
        if (c.promptfooRepeatPasses[r]) {
          totalAllPasses++;
        }
        allScores.push(c.evalboardRepeatScores[r] ?? 0);
      }
    }

    const totalEvaluations = totalCases * repeats;
    const evalboardPassRate = totalEvaluations > 0 ? totalAllPasses / totalEvaluations : 0;
    const evalboardCi = wilsonScoreInterval(totalAllPasses, totalEvaluations, 0.95);

    const evalboardMeanScore = mean(allScores);
    const evalboardScoreCi = bootstrapConfidenceInterval(allScores, { confidence: 0.95 });
    const scoreVar = variance(allScores);
    const scoreStd = standardDeviation(allScores);

    // 4. Identify False Passes: Turn 1 Passed, but repeat pass rate < 1.0 (flaky/unstable)
    const falsePasses: FalsePassDetail[] = [];
    for (const c of caseExecutions) {
      const turn1Passed = Boolean(c.promptfooRepeatPasses[0]);
      const passedRepeats = c.promptfooRepeatPasses.filter(Boolean).length;
      const repeatPassRate = passedRepeats / repeats;

      if (turn1Passed && repeatPassRate < 1.0) {
        falsePasses.push({
          caseIndex: c.caseIndex,
          description: c.description,
          turn1Result: turn1Passed,
          repeatPassRate,
          failureCount: repeats - passedRepeats,
          totalRepeats: repeats,
          sampleOutput: c.sampleOutput,
        });
      }
    }

    const falsePassCount = falsePasses.length;
    const falsePassRate = turn1Passes > 0 ? falsePassCount / turn1Passes : 0;

    // 5. Compute Paired Verdict against baseline if available
    let verdict: VerdictResult | undefined;
    if (
      baselineCaseScores.length === candidateCaseScores.length &&
      candidateCaseScores.length > 0
    ) {
      const pairedAnalysis = analyzePairedDifferences(baselineCaseScores, candidateCaseScores, {
        confidence: 0.95,
      });
      const verdictOutcome = determineVerdict(
        pairedAnalysis.ci,
        pairedAnalysis.meanDifference,
        delta,
        totalCases,
        pairedAnalysis.stdDifference,
      );

      verdict = {
        verdict: verdictOutcome.verdict,
        d: pairedAnalysis.meanDifference,
        ci: pairedAnalysis.ci,
        delta,
        nPairs: totalCases,
        excludedPairs: 0,
        reasoning: verdictOutcome.reasoning,
        estimatedAdditionalCases: verdictOutcome.estimatedAdditionalCases,
      };
    }

    const durationMs = Date.now() - startTime;

    return {
      model: targetModelString,
      baselineModel: options.baselineModel,
      totalCases,
      repeats,
      promptfooPassRate,
      promptfooCi,
      evalboardPassRate,
      evalboardCi,
      evalboardMeanScore,
      evalboardScoreCi,
      scoreVariance: scoreVar,
      scoreStdDev: scoreStd,
      falsePassCount,
      falsePassRate,
      falsePasses,
      verdict,
      executions: caseExecutions,
      warnings: importResult.warnings,
      durationMs,
    };
  }
}

/**
 * Formats a human-readable table summarizing shadow execution results.
 */
export function formatShadowReportTable(report: ShadowReport): string {
  const lines: string[] = [];
  lines.push("================================================================================");
  lines.push("              EVALBOARD PROMPTFOO SHADOW RUN EXECUTION REPORT                   ");
  lines.push("================================================================================");
  lines.push(`Target Model:    ${report.model}`);
  if (report.baselineModel) {
    lines.push(`Baseline Model:  ${report.baselineModel}`);
  }
  lines.push(`Total Cases:     ${report.totalCases}`);
  lines.push(`Repeats (R):     ${report.repeats} (stochastic sampling)`);
  lines.push(`Execution Time:  ${(report.durationMs / 1000).toFixed(2)}s`);
  lines.push("--------------------------------------------------------------------------------");
  lines.push("METRIC COMPARISON (Promptfoo 1-Shot vs Evalboard Repeated Distribution):");
  lines.push(
    `  Promptfoo Pass Rate (Turn 1):  ${(report.promptfooPassRate * 100).toFixed(1)}% ` +
      `[95% Wilson CI: ${(report.promptfooCi.lower * 100).toFixed(1)}% - ${(report.promptfooCi.upper * 100).toFixed(1)}%]`,
  );
  lines.push(
    `  Evalboard Pass Rate (R=${report.repeats}):     ${(report.evalboardPassRate * 100).toFixed(1)}% ` +
      `[95% Wilson CI: ${(report.evalboardCi.lower * 100).toFixed(1)}% - ${(report.evalboardCi.upper * 100).toFixed(1)}%]`,
  );
  lines.push(
    `  Evalboard Mean Continuous:     ${(report.evalboardMeanScore * 100).toFixed(1)}% ` +
      `[95% Bootstrap CI: ${(report.evalboardScoreCi.lower * 100).toFixed(1)}% - ${(report.evalboardScoreCi.upper * 100).toFixed(1)}%]`,
  );
  lines.push(
    `  Stochastic Variance (s):       ${report.scoreStdDev.toFixed(4)} (variance: ${report.scoreVariance.toFixed(4)})`,
  );
  lines.push("--------------------------------------------------------------------------------");
  lines.push("DIVERGENCE & STOCHASTIC INSTABILITY ANALYSIS:");
  lines.push(
    `  False Passes Detected:         ${report.falsePassCount} / ${Math.round(report.promptfooPassRate * report.totalCases)} passed cases ` +
      `(${(report.falsePassRate * 100).toFixed(1)}% of Promptfoo passes were flaky!)`,
  );

  if (report.falsePasses.length > 0) {
    lines.push("  Flaky Cases (Passed on Turn 1, but failed on stochastic repeats):");
    for (const fp of report.falsePasses.slice(0, 5)) {
      const desc = fp.description ? ` (${fp.description})` : "";
      lines.push(
        `    - Case #${fp.caseIndex}${desc}: Pass rate ${(fp.repeatPassRate * 100).toFixed(0)}% ` +
          `(${fp.failureCount}/${fp.totalRepeats} repeats failed)`,
      );
    }
    if (report.falsePasses.length > 5) {
      lines.push(`    ... and ${report.falsePasses.length - 5} more flaky cases.`);
    }
  }

  if (report.verdict) {
    lines.push("--------------------------------------------------------------------------------");
    lines.push("STATISTICAL 4-WAY VERDICT vs BASELINE:");
    lines.push(`  Verdict:     [ ${report.verdict.verdict} ]`);
    lines.push(
      `  Paired Diff: d = ${report.verdict.d >= 0 ? "+" : ""}${(report.verdict.d * 100).toFixed(2)}% ` +
        `[95% CI: ${(report.verdict.ci.lower * 100).toFixed(2)}% to ${(report.verdict.ci.upper * 100).toFixed(2)}%]`,
    );
    lines.push(`  Equivalence: delta = ${(report.verdict.delta * 100).toFixed(1)}%`);
    lines.push(`  Reasoning:   ${report.verdict.reasoning}`);
  }

  if (report.warnings.length > 0) {
    lines.push("--------------------------------------------------------------------------------");
    lines.push(`COMPATIBILITY WARNINGS (${report.warnings.length}):`);
    for (const w of report.warnings) {
      lines.push(`  [${w.code}] ${w.message}`);
      lines.push(`    Remediation: ${w.remediation}`);
    }
  }

  lines.push("================================================================================");
  return lines.join("\n");
}
