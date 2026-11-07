import { hashGraderContent } from "@evalboard/core";
import { Ajv, type ErrorObject, type ValidateFunction } from "ajv";
import { z } from "zod";
import { applyExtractor, extractorConfigSchema } from "../extractors/index.js";
import type { GradeInput, Grader, GraderOutcome } from "../types.js";

export const jsonSchemaGraderConfigSchema = z.object({
  schema: z.record(z.string(), z.unknown()),
  maxViolations: z.number().int().positive().default(5),
  allowTrailingCommas: z.boolean().default(true),
  extractor: extractorConfigSchema.optional().default({ type: "extract_json" }),
});

export type JsonSchemaGraderConfig = z.infer<typeof jsonSchemaGraderConfigSchema>;

export class JsonSchemaGrader implements Grader<JsonSchemaGraderConfig> {
  public readonly type = "json-schema";
  public readonly versionId: string;
  public readonly config: JsonSchemaGraderConfig;
  private readonly validateFn: ValidateFunction;

  constructor(rawConfig: unknown) {
    this.config = jsonSchemaGraderConfigSchema.parse(rawConfig ?? {});
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });

    const ajv = new Ajv({ allErrors: true, strict: false });
    this.validateFn = ajv.compile(this.config.schema);
  }

  private cleanJson(text: string): string {
    let cleaned = text.trim();
    if (this.config.allowTrailingCommas) {
      // Remove trailing commas before } or ]
      cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
    }
    return cleaned;
  }

  grade(input: GradeInput): GraderOutcome {
    const extractedOutput = applyExtractor(input.output, this.config.extractor);
    const cleanedJson = this.cleanJson(extractedOutput);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleanedJson);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        score: 0,
        pass: false,
        reason: `Invalid JSON output: ${msg}`,
        details: {
          error: msg,
          extractedOutput,
        },
      };
    }

    const isValid = this.validateFn(parsed);

    if (isValid) {
      return {
        score: 1,
        pass: true,
        reason: "Output conforms to JSON schema",
        details: {
          parsed,
        },
      };
    }

    const errors: ErrorObject[] = this.validateFn.errors ?? [];
    const maxViolations = this.config.maxViolations;
    const reportedErrors = errors.slice(0, maxViolations);

    const violationSummaries = reportedErrors.map((e) => {
      const path = e.instancePath || "(root)";
      return `${path} ${e.message ?? "failed validation"}`;
    });

    const totalCount = errors.length;
    const reasonSuffix =
      totalCount > maxViolations ? ` (and ${totalCount - maxViolations} more)` : "";

    return {
      score: 0,
      pass: false,
      reason: `Schema validation failed (${totalCount} violations): ${violationSummaries.join("; ")}${reasonSuffix}`,
      details: {
        totalViolations: totalCount,
        violations: reportedErrors,
        parsed,
      },
    };
  }
}
