import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { type ModelConfig, graderConfigSchema, modelConfigSchema } from "./domain.js";

/**
 * Normalises string shorthand for models into ModelConfig:
 * e.g. "ollama:llama3" -> { provider: "ollama", model: "llama3" }
 * e.g. "openrouter:anthropic/claude-3.5-sonnet" -> { provider: "openrouter", model: "anthropic/claude-3.5-sonnet" }
 * e.g. "mock:echo" -> { provider: "mock", model: "echo" }
 * e.g. "claude-3-7-sonnet" -> { provider: "anthropic", model: "claude-3-7-sonnet" }
 */
export function normaliseModelConfig(input: string | ModelConfig): ModelConfig {
  if (typeof input !== "string") {
    return modelConfigSchema.parse(input);
  }

  const trimmed = input.trim();
  if (trimmed.startsWith("ollama:")) {
    return { provider: "ollama", model: trimmed.slice(7), parameters: {} };
  }
  if (trimmed.startsWith("openrouter:")) {
    return { provider: "openrouter", model: trimmed.slice(11), parameters: {} };
  }
  if (trimmed.startsWith("mock:")) {
    return { provider: "mock", model: trimmed.slice(5), parameters: {} };
  }
  if (trimmed.startsWith("openai:")) {
    return { provider: "openai", model: trimmed.slice(7), parameters: {} };
  }
  if (trimmed.startsWith("anthropic:")) {
    return { provider: "anthropic", model: trimmed.slice(10), parameters: {} };
  }
  if (trimmed.toLowerCase().includes("claude")) {
    return { provider: "anthropic", model: trimmed, parameters: {} };
  }
  return { provider: "openai", model: trimmed, parameters: {} };
}

export const suiteBaselineSchema = z.object({
  prompt: z.string().min(1, "Baseline prompt reference cannot be empty"),
  model: z.string().min(1, "Baseline model reference cannot be empty"),
});

export type SuiteBaseline = z.infer<typeof suiteBaselineSchema>;

/**
 * Normalised grader input allowing shorthand rubric/schema keys:
 * e.g. { type: 'llm-rubric', rubric: 'path', judge: 'claude-xxx' }
 */
const rawGraderSchema = z.preprocess((val) => {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const raw = val as Record<string, unknown>;
    const type = String(raw.type ?? "");
    const config: Record<string, unknown> = {
      ...(typeof raw.config === "object" && raw.config !== null
        ? (raw.config as Record<string, unknown>)
        : {}),
    };

    if (raw.rubric) config.rubric = raw.rubric;
    if (raw.schema) config.schema = raw.schema;
    if (raw.tolerance) config.tolerance = raw.tolerance;

    let judgeModel: ModelConfig | undefined = undefined;
    if (raw.judge) {
      judgeModel = normaliseModelConfig(raw.judge as string | ModelConfig);
    } else if (raw.judgeModel) {
      judgeModel = normaliseModelConfig(raw.judgeModel as string | ModelConfig);
    }

    return {
      type,
      name: raw.name ?? (typeof raw.name === "string" ? raw.name : undefined),
      config,
      judgePromptText: typeof raw.judgePromptText === "string" ? raw.judgePromptText : undefined,
      judgeModel,
    };
  }
  return val;
}, graderConfigSchema);

export const suiteSchema = z.object({
  name: z.string().min(1, "Suite name is required"),
  description: z.string().optional(),
  prompts: z
    .array(z.string().min(1, "Prompt reference cannot be empty"))
    .min(1, "Suite must contain at least one prompt"),
  models: z
    .array(z.union([z.string(), modelConfigSchema]))
    .min(1, "Suite must contain at least one model")
    .transform((models) => models.map(normaliseModelConfig)),
  dataset: z.string().min(1, "Dataset path or reference is required"),
  repeats: z.number().int().positive("Repeats must be a positive integer").default(1),
  graders: z.array(rawGraderSchema).min(1, "Suite must specify at least one grader"),
  baseline: suiteBaselineSchema,
  delta: z
    .number()
    .positive("Delta must be positive")
    .max(1, "Delta cannot exceed 1.0")
    .default(0.03),
  confidenceLevel: z
    .number()
    .min(0.5, "Confidence level must be >= 0.5")
    .max(1, "Confidence level must be <= 1.0")
    .default(0.95),
  tags: z.array(z.string()).default([]),
});

export type Suite = z.infer<typeof suiteSchema>;

/**
 * Parses and validates a Suite config from YAML, JSON, or an object.
 * Throws a human-readable Zod formatted error on validation failure.
 */
export function parseSuiteConfig(input: string | unknown): Suite {
  let parsedRaw: unknown = input;

  if (typeof input === "string") {
    try {
      parsedRaw = parseYaml(input);
    } catch (err) {
      throw new Error(
        `Invalid YAML/JSON syntax in suite configuration: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const result = suiteSchema.safeParse(parsedRaw);
  if (!result.success) {
    const formatted = result.error.errors
      .map((e) => `  - ${e.path.join(".") || "root"}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid suite configuration:\n${formatted}`);
  }

  return result.data;
}
