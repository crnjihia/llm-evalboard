import vm from "node:vm";
import { hashGraderContent } from "@evalboard/core";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const regexGraderConfigSchema = z.object({
  pattern: z.string().min(1),
  flags: z.string().default(""),
  inverted: z.boolean().default(false),
  timeoutMs: z.number().int().positive().default(100),
  extractor: extractorConfigSchema.optional(),
});

export type RegexGraderConfig = z.infer<typeof regexGraderConfigSchema>;

export class RegexGrader implements Grader<RegexGraderConfig> {
  public readonly type = "regex";
  public readonly versionId: string;
  public readonly config: RegexGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = regexGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  grade(input: GradeInput): GraderOutcome {
    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const { pattern, flags, inverted, timeoutMs } = this.config;

    let matched = false;
    let timedOut = false;
    let executionError: string | null = null;

    try {
      // Execute regex in a sandboxed VM context with a strict execution timeout to prevent ReDoS hangs
      const code = "new RegExp(pattern, flags).test(text)";
      const result = vm.runInNewContext(
        code,
        { pattern, flags, text: extractedOutput },
        { timeout: timeoutMs },
      );
      matched = Boolean(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timed out")) {
        timedOut = true;
      } else {
        executionError = msg;
      }
    }

    if (timedOut) {
      return {
        score: 0,
        pass: false,
        reason: `Regex execution timed out after ${timeoutMs}ms (possible catastrophic backtracking / ReDoS)`,
        details: {
          pattern,
          flags,
          timedOut: true,
          timeoutMs,
          extractedOutput,
        },
      };
    }

    if (executionError) {
      return {
        score: 0,
        pass: false,
        reason: `Regex execution failed: ${executionError}`,
        details: {
          pattern,
          flags,
          error: executionError,
          extractedOutput,
        },
      };
    }

    const pass = inverted ? !matched : matched;
    const score = pass ? 1 : 0;

    let reason: string;
    if (inverted) {
      reason = pass
        ? `Output did not match inverted pattern /${pattern}/${flags}`
        : `Output matched forbidden pattern /${pattern}/${flags}`;
    } else {
      reason = pass
        ? `Output matched pattern /${pattern}/${flags}`
        : `Output did not match pattern /${pattern}/${flags}`;
    }

    return {
      score,
      pass,
      reason,
      details: {
        pattern,
        flags,
        inverted,
        matched,
        extractedOutput,
      },
    };
  }
}
