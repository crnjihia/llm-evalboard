import { z } from "zod";

export const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .url("DATABASE_URL must be a valid connection URL")
    .optional()
    .or(z.literal("")),
  ANTHROPIC_API_KEY: z.string().min(1).optional().or(z.literal("")),
  OPENROUTER_API_KEY: z.string().min(1).optional().or(z.literal("")),
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  MAX_COST_USD: z.coerce.number().positive().optional(),
  DEFAULT_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join(", ");
    throw new Error(`Environment validation failed: ${formattedErrors}`);
  }
  return result.data;
}
