import { hashGraderContent } from "@evalboard/core";
import type { Provider } from "@evalboard/providers";
import { z } from "zod";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";
import { wrapInDefendedDataBlock } from "./prompt-injection-defense.js";

export const rubricAnchorExampleSchema = z.object({
  score: z.number(),
  example: z.string(),
  explanation: z.string().optional(),
});

export const rubricCriterionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  scale: z.enum(["pass_fail", "1-5"]).or(z.object({ min: z.number(), max: z.number() })),
  weight: z.number().positive().default(1),
  anchorExamples: z.array(rubricAnchorExampleSchema).optional(),
});

export type RubricCriterion = z.infer<typeof rubricCriterionSchema>;

export const rubricJudgeConfigSchema = z.object({
  rubric: z.array(rubricCriterionSchema).min(1),
  reasoningBeforeScore: z.boolean().default(true),
  temperature: z.number().min(0).max(1).default(0.0),
  passThreshold: z.number().min(0).max(1).default(0.7),
  judgeModel: z.object({
    provider: z.string(),
    model: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type RubricJudgeConfig = z.infer<typeof rubricJudgeConfigSchema>;

export const criterionEvaluationSchema = z.object({
  rationale: z.string(),
  score: z.number(),
});

export const judgeEvaluationResponseSchema = z.record(z.string(), criterionEvaluationSchema);

/**
 * Normalizes criterion score to [0, 1] range based on its scale.
 */
function normalizeCriterionScore(score: number, scale: RubricCriterion["scale"]): number {
  if (scale === "pass_fail") {
    return score > 0 ? 1 : 0;
  }
  if (scale === "1-5") {
    return Math.max(0, Math.min(1, (score - 1) / 4));
  }
  const min = scale.min;
  const max = scale.max;
  if (max === min) return 1.0;
  return Math.max(0, Math.min(1, (score - min) / (max - min)));
}

/**
 * Checks for self-preference risk if candidate and judge share the same model family.
 */
export function checkSelfPreferenceWarning(
  judgeModel: string,
  candidateModel?: string,
): string | null {
  if (!candidateModel) return null;

  const getFamily = (m: string) => {
    const lower = m.toLowerCase();
    if (lower.includes("claude") || lower.includes("anthropic")) return "claude";
    if (
      lower.includes("gpt") ||
      lower.includes("openai") ||
      lower.includes("o1") ||
      lower.includes("o3")
    )
      return "openai";
    if (lower.includes("llama") || lower.includes("meta")) return "llama";
    if (lower.includes("gemini") || lower.includes("google")) return "gemini";
    if (lower.includes("mistral") || lower.includes("mixtral")) return "mistral";
    if (lower.includes("qwen") || lower.includes("alibaba")) return "qwen";
    return lower.split(/[:/-]/)[0];
  };

  const judgeFam = getFamily(judgeModel);
  const candFam = getFamily(candidateModel);

  if (judgeFam && candFam && judgeFam === candFam) {
    return `Self-preference risk: Judge model ('${judgeModel}') and evaluated candidate ('${candidateModel}') belong to the same model family ('${judgeFam}'). Same-family judges systematically overestimate their own outputs.`;
  }

  return null;
}

export class RubricJudge implements Grader<RubricJudgeConfig> {
  public readonly type = "llm-rubric";
  public readonly versionId: string;
  public readonly config: RubricJudgeConfig;
  public readonly judgePromptText: string;

  constructor(
    rawConfig: unknown,
    private readonly providerResolver?: (provider: string, model: string) => Provider,
  ) {
    this.config = rubricJudgeConfigSchema.parse(rawConfig ?? {});
    this.judgePromptText = this.buildJudgeSystemPrompt();
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
      judgePromptText: this.judgePromptText,
      judgeModel: this.config.judgeModel,
    });
  }

  private buildJudgeSystemPrompt(): string {
    const lines: string[] = [
      "You are an impartial, rigorous expert evaluation judge.",
      "Your objective is to evaluate the provided candidate output against defined rubric criteria.",
      "",
      "EVALUATION CRITERIA:",
    ];

    for (const crit of this.config.rubric) {
      const scaleStr =
        crit.scale === "pass_fail"
          ? "Scale: 0 (Fail) or 1 (Pass)"
          : crit.scale === "1-5"
            ? "Scale: 1 to 5 (1=Poor, 3=Acceptable, 5=Exceptional)"
            : `Scale: ${crit.scale.min} to ${crit.scale.max}`;

      lines.push(`- Criterion: "${crit.name}" (Weight: ${crit.weight})`);
      lines.push(`  Description: ${crit.description}`);
      lines.push(`  ${scaleStr}`);

      if (crit.anchorExamples && crit.anchorExamples.length > 0) {
        lines.push("  Anchor Examples:");
        for (const anchor of crit.anchorExamples) {
          lines.push(
            `    - Score ${anchor.score}: "${anchor.example}"${anchor.explanation ? ` (${anchor.explanation})` : ""}`,
          );
        }
      }
    }

    lines.push("");
    lines.push("OUTPUT FORMAT REQUIREMENTS:");
    lines.push(
      "You MUST respond with a valid JSON object only. Do NOT output conversational chatter or markdown backticks.",
    );
    lines.push(
      "For each criterion, provide detailed reasoning and explanation BEFORE assigning the numerical score.",
    );
    lines.push("Format:");
    lines.push(
      JSON.stringify(
        Object.fromEntries(
          this.config.rubric.map((c) => [
            c.name,
            { rationale: "<detailed reasoning evaluating criterion>", score: 3 },
          ]),
        ),
        null,
        2,
      ),
    );

    return lines.join("\n");
  }

  async grade(input: GradeInput): Promise<GraderOutcome> {
    const candidateModel =
      typeof input.context?.candidateModel === "string" ? input.context.candidateModel : undefined;
    const selfPrefWarning = checkSelfPreferenceWarning(
      this.config.judgeModel.model,
      candidateModel,
    );

    const defendedOutputBlock = wrapInDefendedDataBlock(input.output, "Candidate Output");
    const userPromptLines = [
      "Please evaluate the candidate response for the following test case input.",
      "",
      `Test Case Input: ${JSON.stringify(input.case.input, null, 2)}`,
    ];

    if (input.case.expected !== undefined && input.case.expected !== null) {
      userPromptLines.push(`Reference / Expected Answer: ${JSON.stringify(input.case.expected)}`);
    }

    userPromptLines.push("");
    userPromptLines.push(defendedOutputBlock);

    const userPrompt = userPromptLines.join("\n");

    let provider: Provider;
    if (this.providerResolver) {
      provider = this.providerResolver(
        this.config.judgeModel.provider,
        this.config.judgeModel.model,
      );
    } else {
      throw new Error(
        `Provider resolver required for RubricJudge (${this.config.judgeModel.provider})`,
      );
    }

    // Call LLM judge
    const response = await provider.generate({
      model: this.config.judgeModel.model,
      messages: [
        { role: "system", content: this.judgePromptText },
        { role: "user", content: userPrompt },
      ],
      params: {
        temperature: this.config.temperature,
      },
    });

    // Parse and validate judge structured JSON response
    let parsedJson: unknown;
    try {
      let rawText = response.text.trim();
      // Strip markdown code block if present
      if (rawText.startsWith("```")) {
        rawText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
      }
      parsedJson = JSON.parse(rawText);
    } catch {
      return {
        score: 0,
        pass: false,
        reason: `LLM judge failed to return valid JSON: ${response.text.slice(0, 150)}`,
        details: { rawResponse: response.text },
      };
    }

    const parseResult = judgeEvaluationResponseSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      return {
        score: 0,
        pass: false,
        reason: `LLM judge response did not match evaluation schema: ${parseResult.error.message}`,
        details: { rawResponse: response.text, parsed: parsedJson },
      };
    }

    const evaluation = parseResult.data;
    let totalWeightedScore = 0;
    let totalWeight = 0;
    const criteriaDetails: Record<
      string,
      { rawScore: number; normalizedScore: number; rationale: string }
    > = {};

    for (const crit of this.config.rubric) {
      const critEval = evaluation[crit.name];
      if (!critEval) {
        continue;
      }

      const normalized = normalizeCriterionScore(critEval.score, crit.scale);
      totalWeightedScore += normalized * crit.weight;
      totalWeight += crit.weight;

      criteriaDetails[crit.name] = {
        rawScore: critEval.score,
        normalizedScore: normalized,
        rationale: critEval.rationale,
      };
    }

    const normalizedOverall = totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
    const finalScore = Math.round(normalizedOverall * 10000) / 10000;
    const pass = finalScore >= this.config.passThreshold;

    const summaryReasons = Object.entries(criteriaDetails)
      .map(([name, d]) => `${name}: ${d.rawScore} (${d.rationale.slice(0, 60)}...)`)
      .join(" | ");

    const reason = `Rubric Score: ${(finalScore * 100).toFixed(1)}% (${pass ? "PASS" : "FAIL"}). ${summaryReasons}`;

    return {
      score: finalScore,
      pass,
      reason,
      details: {
        criteria: criteriaDetails,
        totalWeight,
        passThreshold: this.config.passThreshold,
        selfPreferenceWarning: selfPrefWarning,
        judgeUsage: response.usage,
      },
    };
  }
}
