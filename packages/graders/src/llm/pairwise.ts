import { hashGraderContent } from "@evalboard/core";
import type { Provider } from "@evalboard/providers";
import { z } from "zod";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";
import { wrapInDefendedDataBlock } from "./prompt-injection-defense.js";

export type PairwiseWinner = "A" | "B" | "tie" | "inconsistent";

export const pairwiseJudgeConfigSchema = z.object({
  criterion: z.string().default("Overall Quality"),
  instructions: z.string().optional(),
  referenceGuided: z.boolean().default(false),
  temperature: z.number().min(0).max(1).default(0.0),
  judgeModel: z.object({
    provider: z.string(),
    model: z.string(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type PairwiseJudgeConfig = z.infer<typeof pairwiseJudgeConfigSchema>;

export const pairwiseJudgementSchema = z.object({
  rationale: z.string(),
  winner: z.enum(["1", "2", "tie"]).or(z.enum(["first", "second", "tie"])),
});

/**
 * Resolves the swap logic between two ordered evaluations to mitigate position bias.
 *
 * In Order 1: Candidate is in position 1, Baseline is in position 2.
 * In Order 2: Baseline is in position 1, Candidate is in position 2.
 */
export function resolvePairwiseSwap(
  order1Winner: "1" | "2" | "tie",
  order2Winner: "1" | "2" | "tie",
): {
  winner: PairwiseWinner;
  isInconsistent: boolean;
  score: number;
  reason: string;
} {
  // Map outcomes to Candidate ("A") vs Baseline ("B")
  // In Order 1: 1 is A, 2 is B
  const order1PrefersA = order1Winner === "1";
  const order1PrefersB = order1Winner === "2";
  const order1Tie = order1Winner === "tie";

  // In Order 2: 1 is B, 2 is A
  const order2PrefersA = order2Winner === "2";
  const order2PrefersB = order2Winner === "1";
  const order2Tie = order2Winner === "tie";

  // Check agreement
  if (order1PrefersA && order2PrefersA) {
    return {
      winner: "A",
      isInconsistent: false,
      score: 1.0,
      reason:
        "Candidate (A) won consistently across both presentation orders (position bias swap verified).",
    };
  }

  if (order1PrefersB && order2PrefersB) {
    return {
      winner: "B",
      isInconsistent: false,
      score: 0.0,
      reason:
        "Baseline (B) won consistently across both presentation orders (position bias swap verified).",
    };
  }

  if (order1Tie && order2Tie) {
    return {
      winner: "tie",
      isInconsistent: false,
      score: 0.5,
      reason: "Pairwise evaluation resulted in a tie in both presentation orders.",
    };
  }

  // If the orders disagreed, flag as INCONSISTENT
  return {
    winner: "inconsistent",
    isInconsistent: true,
    score: 0.5,
    reason: `Inconsistent position-bias outcome: Order 1 favored ${order1Winner === "1" ? "Position 1 (Candidate)" : order1Winner === "2" ? "Position 2 (Baseline)" : "Tie"}, while Order 2 favored ${order2Winner === "1" ? "Position 1 (Baseline)" : order2Winner === "2" ? "Position 2 (Candidate)" : "Tie"}. Flagged as inconsistent.`,
  };
}

export class PairwiseJudge implements Grader<PairwiseJudgeConfig> {
  public readonly type = "pairwise";
  public readonly versionId: string;
  public readonly config: PairwiseJudgeConfig;
  public readonly judgePromptText: string;

  constructor(
    rawConfig: unknown,
    private readonly providerResolver?: (provider: string, model: string) => Provider,
  ) {
    this.config = pairwiseJudgeConfigSchema.parse(rawConfig ?? {});
    this.judgePromptText = this.buildSystemPrompt();
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
      judgePromptText: this.judgePromptText,
      judgeModel: this.config.judgeModel,
    });
  }

  private buildSystemPrompt(): string {
    return [
      "You are an impartial, highly rigorous expert comparative judge.",
      `Your task is to compare two candidate responses (Response 1 and Response 2) on the criterion: "${this.config.criterion}".`,
      this.config.instructions ? `Evaluation Guidance: ${this.config.instructions}` : "",
      "",
      "IMPORTANT RULES:",
      "1. Evaluate both responses strictly on merit.",
      "2. Respond ONLY with valid JSON matching:",
      '   { "rationale": "<step-by-step comparative analysis>", "winner": "1" | "2" | "tie" }',
      "3. Do not include markdown code fences or conversational greetings.",
    ].join("\n");
  }

  private buildOrderPrompt(
    firstOutput: string,
    secondOutput: string,
    inputCase: GradeInput["case"],
  ): string {
    const lines = [
      "Compare Response 1 and Response 2 for the following input:",
      `Test Case Input: ${JSON.stringify(inputCase.input, null, 2)}`,
    ];

    if (this.config.referenceGuided && inputCase.expected) {
      lines.push(`Reference Answer: ${JSON.stringify(inputCase.expected)}`);
    }

    lines.push("");
    lines.push(wrapInDefendedDataBlock(firstOutput, "Response 1"));
    lines.push("");
    lines.push(wrapInDefendedDataBlock(secondOutput, "Response 2"));
    lines.push("");
    lines.push(
      "Which response is superior? Output JSON with your rationale and winner ('1', '2', or 'tie').",
    );

    return lines.join("\n");
  }

  async grade(input: GradeInput): Promise<GraderOutcome> {
    const baselineOutput =
      typeof input.context?.baselineOutput === "string"
        ? input.context.baselineOutput
        : typeof input.case.expected === "string"
          ? input.case.expected
          : "";

    if (!baselineOutput) {
      return {
        score: 0.5,
        pass: true,
        reason: "No baseline output provided for pairwise comparison; assigned neutral score 0.5",
      };
    }

    const candidateOutput = input.output;

    if (!this.providerResolver) {
      throw new Error(
        `Provider resolver required for PairwiseJudge (${this.config.judgeModel.provider})`,
      );
    }

    const provider = this.providerResolver(
      this.config.judgeModel.provider,
      this.config.judgeModel.model,
    );

    // ORDER 1: Response 1 = Candidate (A), Response 2 = Baseline (B)
    const promptOrder1 = this.buildOrderPrompt(candidateOutput, baselineOutput, input.case);

    // ORDER 2: Response 1 = Baseline (B), Response 2 = Candidate (A)
    const promptOrder2 = this.buildOrderPrompt(baselineOutput, candidateOutput, input.case);

    // Execute both orders concurrently
    const [res1, res2] = await Promise.all([
      provider.generate({
        model: this.config.judgeModel.model,
        messages: [
          { role: "system", content: this.judgePromptText },
          { role: "user", content: promptOrder1 },
        ],
        params: { temperature: this.config.temperature },
      }),
      provider.generate({
        model: this.config.judgeModel.model,
        messages: [
          { role: "system", content: this.judgePromptText },
          { role: "user", content: promptOrder2 },
        ],
        params: { temperature: this.config.temperature },
      }),
    ]);

    const parseOrder = (text: string): "1" | "2" | "tie" => {
      try {
        let clean = text.trim();
        if (clean.startsWith("```")) {
          clean = clean.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        }
        const parsed = JSON.parse(clean);
        const w = String(parsed.winner).toLowerCase();
        if (w === "1" || w === "first") return "1";
        if (w === "2" || w === "second") return "2";
        return "tie";
      } catch {
        return "tie";
      }
    };

    const order1Winner = parseOrder(res1.text);
    const order2Winner = parseOrder(res2.text);

    const resolution = resolvePairwiseSwap(order1Winner, order2Winner);

    return {
      score: resolution.score,
      pass: resolution.winner === "A" || resolution.winner === "tie",
      reason: resolution.reason,
      details: {
        winner: resolution.winner,
        isInconsistent: resolution.isInconsistent,
        order1Winner,
        order2Winner,
        order1RawResponse: res1.text,
        order2RawResponse: res2.text,
        usage: {
          inputTokens: (res1.usage?.inputTokens ?? 0) + (res2.usage?.inputTokens ?? 0),
          outputTokens: (res1.usage?.outputTokens ?? 0) + (res2.usage?.outputTokens ?? 0),
        },
      },
    };
  }
}
