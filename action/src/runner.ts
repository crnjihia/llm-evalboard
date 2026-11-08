import fs from "node:fs/promises";
import path from "node:path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  type CaseComparisonData,
  compareCells,
  hashCaseContent,
  parseDataset,
  parsePromptFile,
  parseSuiteConfig,
  renderTemplateString,
} from "@evalboard/core";
import { createGrader } from "@evalboard/graders";
import { type Provider, createProvider } from "@evalboard/providers";
import { evaluateMergeGate } from "./gatekeeper.js";
import { postOrUpdateStickyComment } from "./github.js";
import { generatePrCommentMarkdown } from "./markdown.js";
import { exportToLangfuse } from "./observability/langfuse.js";
import { createOtelGenAiSpan, exportSpansToOtelEndpoint } from "./observability/otel.js";
import type {
  ActionInputs,
  ActionOutputs,
  ComparisonSummaryData,
  GatingPolicy,
  SliceComparisonData,
} from "./types.js";

export interface RunActionOptions {
  inputs?: ActionInputs;
  customCandidateProvider?: Provider;
  customBaselineProvider?: Provider;
}

/**
 * Reads action inputs from GitHub Actions environment or fallback parameters.
 */
export function getActionInputs(): ActionInputs {
  const config = core.getInput("config") || "evalboard.yaml";
  const githubToken = core.getInput("github-token") || process.env.GITHUB_TOKEN;
  const failOnRegression = core.getBooleanInput("fail-on-regression");
  const failOnInconclusive = core.getBooleanInput("fail-on-inconclusive");
  const deltaStr = core.getInput("delta") || "0.03";
  const repeatsStr = core.getInput("repeats");
  const baselineRef = core.getInput("baseline-ref");
  const otelEndpoint = core.getInput("otel-endpoint") || process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const langfuseHost = core.getInput("langfuse-host") || process.env.LANGFUSE_HOST;
  const langfusePublicKey = core.getInput("langfuse-public-key") || process.env.LANGFUSE_PUBLIC_KEY;
  const langfuseSecretKey = core.getInput("langfuse-secret-key") || process.env.LANGFUSE_SECRET_KEY;

  return {
    config,
    githubToken,
    failOnRegression: failOnRegression !== false,
    failOnInconclusive: Boolean(failOnInconclusive),
    delta: Number.parseFloat(deltaStr) || 0.03,
    repeats: repeatsStr ? Number.parseInt(repeatsStr, 10) : undefined,
    baselineRef,
    otelEndpoint,
    langfuseHost,
    langfusePublicKey,
    langfuseSecretKey,
  };
}

/**
 * Main execution logic for the GitHub Action.
 */
export async function runAction(options: RunActionOptions = {}): Promise<ActionOutputs> {
  const resolvedInputs = options.inputs ?? getActionInputs();

  core.info("=== Executing llm-evalboard CI Action ===");
  core.info(`Config: ${resolvedInputs.config}`);
  core.info(`Delta:  ${resolvedInputs.delta}`);

  // 1. Read and parse suite config
  const configPath = path.resolve(process.cwd(), resolvedInputs.config);
  const suiteYaml = await fs.readFile(configPath, "utf-8");
  const suite = parseSuiteConfig(suiteYaml);

  const repeats = resolvedInputs.repeats ?? suite.repeats ?? 1;
  const delta = resolvedInputs.delta ?? suite.delta ?? 0.03;

  // 2. Resolve dataset and prompt files
  const baseDir = path.dirname(configPath);
  const datasetPath = path.resolve(baseDir, suite.dataset);
  const datasetRaw = await fs.readFile(datasetPath, "utf-8");
  const dataset = parseDataset(datasetRaw);

  const promptTemplates: Record<string, string> = {};
  for (const promptRef of suite.prompts) {
    const promptPath = path.resolve(baseDir, promptRef);
    try {
      const promptRaw = await fs.readFile(promptPath, "utf-8");
      const parsedPrompt = parsePromptFile(promptRaw);
      promptTemplates[promptRef] = parsedPrompt.template;
    } catch {
      promptTemplates[promptRef] = promptRef;
    }
  }

  // 3. Identify Candidate and Baseline Models
  const baselineModel =
    suite.models.find((m) => m.model === suite.baseline.model) ?? suite.models[0];
  const candidateModel =
    suite.models.find((m) => m.model !== suite.baseline.model) ?? suite.models[1] ?? baselineModel;

  if (!baselineModel || !candidateModel) {
    throw new Error("Evaluation requires at least one model configuration.");
  }

  const baselineProvider = options.customBaselineProvider ?? createProvider(baselineModel);
  const candidateProvider = options.customCandidateProvider ?? createProvider(candidateModel);

  // 4. Instantiate Graders
  const graders = suite.graders.map((g) => createGrader(g.type, g.config));

  // 5. Execute Paired Evaluations
  const promptTemplate = promptTemplates[suite.prompts[0] ?? ""] ?? "{{input}}";
  const caseComparisons: CaseComparisonData[] = [];

  core.info(
    `Evaluating ${dataset.cases.length} cases against Candidate (${candidateModel.model}) vs Baseline (${baselineModel.model}) [Repeats: ${repeats}]...`,
  );

  for (let idx = 0; idx < dataset.cases.length; idx++) {
    const caseItem = dataset.cases[idx];
    if (!caseItem) continue;

    const caseId = hashCaseContent({
      input: caseItem.input,
      expected: caseItem.expected,
      tags: caseItem.tags,
      metadata: caseItem.metadata,
    });

    const renderedPrompt = renderTemplateString(promptTemplate, caseItem.input, { strict: false });

    const baselineRuns: CaseComparisonData["baselineRuns"] = [];
    const candidateRuns: CaseComparisonData["candidateRuns"] = [];

    for (let r = 0; r < repeats; r++) {
      // Evaluate Candidate
      const cStart = Date.now();
      const cRes = await candidateProvider.generate({
        model: candidateModel.model,
        messages: [{ role: "user", content: renderedPrompt }],
        params: {
          temperature: candidateModel.parameters?.temperature ?? (r > 0 ? 0.7 : 0.0),
          seed: 42 + r * 1000 + idx,
        },
      });
      const cLatency = Date.now() - cStart;
      const cOutput = cRes.text ?? "";

      let cTotalScore = 0;
      let cAllPass = true;
      for (const grader of graders) {
        const out = await grader.grade({
          case: { id: caseId, input: caseItem.input, expected: caseItem.expected },
          output: cOutput,
          context: { latencyMs: cLatency, costUsd: cRes.usage?.costUsd ?? 0 },
        });
        cTotalScore += out.score;
        if (!out.pass) cAllPass = false;
      }
      const cScore = graders.length > 0 ? cTotalScore / graders.length : 1.0;

      candidateRuns.push({
        score: cScore,
        pass: cAllPass,
        output: cOutput,
        latencyMs: cLatency,
        costUsd: cRes.usage?.costUsd ?? 0,
        tokens: {
          prompt: cRes.usage?.inputTokens ?? 0,
          completion: cRes.usage?.outputTokens ?? 0,
          total: cRes.usage?.totalTokens ?? 0,
        },
      });

      // Evaluate Baseline
      const bStart = Date.now();
      const bRes = await baselineProvider.generate({
        model: baselineModel.model,
        messages: [{ role: "user", content: renderedPrompt }],
        params: {
          temperature: baselineModel.parameters?.temperature ?? (r > 0 ? 0.7 : 0.0),
          seed: 42 + r * 1000 + idx,
        },
      });
      const bLatency = Date.now() - bStart;
      const bOutput = bRes.text ?? "";

      let bTotalScore = 0;
      let bAllPass = true;
      for (const grader of graders) {
        const out = await grader.grade({
          case: { id: caseId, input: caseItem.input, expected: caseItem.expected },
          output: bOutput,
          context: { latencyMs: bLatency, costUsd: bRes.usage?.costUsd ?? 0 },
        });
        bTotalScore += out.score;
        if (!out.pass) bAllPass = false;
      }
      const bScore = graders.length > 0 ? bTotalScore / graders.length : 1.0;

      baselineRuns.push({
        score: bScore,
        pass: bAllPass,
        output: bOutput,
        latencyMs: bLatency,
        costUsd: bRes.usage?.costUsd ?? 0,
        tokens: {
          prompt: bRes.usage?.inputTokens ?? 0,
          completion: bRes.usage?.outputTokens ?? 0,
          total: bRes.usage?.totalTokens ?? 0,
        },
      });
    }

    caseComparisons.push({
      caseId,
      input: caseItem.input,
      metadata: caseItem.metadata ?? undefined,
      tags: caseItem.tags,
      baselineRuns,
      candidateRuns,
    });
  }

  // 6. Compare candidate against baseline using ComparisonEngine
  const runId = Math.random().toString(16).slice(2).padEnd(32, "0");
  const comparisonReport = compareCells(
    {
      runId,
      baselineCell: {
        id: "cell_baseline",
        name: `${baselineModel.provider}:${baselineModel.model}`,
      },
      candidateCell: {
        id: "cell_candidate",
        name: `${candidateModel.provider}:${candidateModel.model}`,
      },
      cases: caseComparisons,
      metricNames: ["Overall Score"],
    },
    { delta },
  );

  const primaryMetric = comparisonReport.metrics[0];
  if (!primaryMetric) {
    throw new Error("Comparison produced no primary metric evaluation.");
  }

  // 7. Format Slice Results
  const slices: SliceComparisonData[] = comparisonReport.slices.map((s) => ({
    tag: `${s.sliceKey}=${s.sliceValue}`,
    n: s.sampleSize,
    candidateScore: s.candidateMean,
    baselineScore: s.baselineMean,
    meanDifference: s.diff,
    ciLower: s.ci.lower,
    ciUpper: s.ci.upper,
    verdict: s.verdict,
  }));

  // 8. Compile summary data
  const summaryData: ComparisonSummaryData = {
    suiteName: suite.name,
    candidateName: `${candidateModel.provider}:${candidateModel.model}`,
    baselineName: `${baselineModel.provider}:${baselineModel.model}`,
    candidateScore: primaryMetric.candidateMean,
    baselineScore: primaryMetric.baselineMean,
    meanDifference: primaryMetric.diff,
    ciLower: primaryMetric.ci.lower,
    ciUpper: primaryMetric.ci.upper,
    confidence: primaryMetric.ci.confidence,
    delta: primaryMetric.delta,
    verdict: primaryMetric.verdict,
    reasoning: primaryMetric.reasoning,
    nPairs: primaryMetric.nPairs,
    estimatedAdditionalCases: primaryMetric.estimatedAdditionalCases,
    candidateCostUsd: comparisonReport.usage?.candidate?.totalCostUsd,
    baselineCostUsd: comparisonReport.usage?.baseline?.totalCostUsd,
    candidateLatencyMs: comparisonReport.usage?.candidate?.latencyMeanMs,
    baselineLatencyMs: comparisonReport.usage?.baseline?.latencyMeanMs,
    slices: slices.length > 0 ? slices : undefined,
    commitSha: process.env.GITHUB_SHA,
    prNumber: github.context?.payload?.pull_request?.number,
  };

  // 9. Evaluate Merge Gate
  const gatingPolicy: GatingPolicy = {
    failOnRegression: resolvedInputs.failOnRegression,
    failOnInconclusive: resolvedInputs.failOnInconclusive,
    delta,
  };

  const gateResult = evaluateMergeGate(summaryData.verdict, gatingPolicy);

  // 10. Generate PR Markdown Report
  const reportMarkdown = generatePrCommentMarkdown(summaryData);

  // 11. Post or update sticky comment if in PR context
  if (resolvedInputs.githubToken && github.context?.repo && summaryData.prNumber) {
    try {
      core.info(`Posting/updating sticky comment on PR #${summaryData.prNumber}...`);
      await postOrUpdateStickyComment({
        token: resolvedInputs.githubToken,
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issueNumber: summaryData.prNumber,
        body: reportMarkdown,
      });
    } catch (err) {
      core.warning(
        `Failed to post sticky PR comment: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 12. Optional Observability Export (OpenTelemetry & Langfuse)
  if (resolvedInputs.otelEndpoint) {
    try {
      core.info(`Exporting spans to OpenTelemetry endpoint '${resolvedInputs.otelEndpoint}'...`);
      const spans = caseComparisons.map((c) =>
        createOtelGenAiSpan({
          suiteName: suite.name,
          caseId: c.caseId,
          model: candidateModel.model,
          provider: candidateModel.provider,
          latencyMs: c.candidateRuns[0]?.latencyMs ?? 100,
          score: c.candidateRuns[0]?.score,
          pass: c.candidateRuns[0]?.pass,
        }),
      );
      await exportSpansToOtelEndpoint(spans, resolvedInputs.otelEndpoint);
    } catch (err) {
      core.warning(`OTel export error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (
    resolvedInputs.langfuseHost &&
    resolvedInputs.langfusePublicKey &&
    resolvedInputs.langfuseSecretKey
  ) {
    try {
      core.info(`Exporting trace payload to Langfuse host '${resolvedInputs.langfuseHost}'...`);
      await exportToLangfuse([], {
        host: resolvedInputs.langfuseHost,
        publicKey: resolvedInputs.langfusePublicKey,
        secretKey: resolvedInputs.langfuseSecretKey,
      });
    } catch (err) {
      core.warning(`Langfuse export error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 13. Set Action Outputs
  core.setOutput("verdict", summaryData.verdict);
  core.setOutput("effect-size", summaryData.meanDifference.toFixed(4));
  core.setOutput("ci-lower", summaryData.ciLower.toFixed(4));
  core.setOutput("ci-upper", summaryData.ciUpper.toFixed(4));
  core.setOutput("passed", gateResult.passed.toString());
  core.setOutput("report-markdown", reportMarkdown);

  if (!gateResult.passed) {
    core.setFailed(gateResult.reason);
  } else {
    core.info(`Merge gate SUCCESS: ${gateResult.reason}`);
  }

  return {
    verdict: summaryData.verdict,
    effectSize: summaryData.meanDifference,
    ciLower: summaryData.ciLower,
    ciUpper: summaryData.ciUpper,
    passed: gateResult.passed,
    reportMarkdown,
  };
}
