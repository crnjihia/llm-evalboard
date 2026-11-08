import { z } from "zod";

/**
 * Promptfoo Assertion Schema
 * Represents standard Promptfoo assertion types: equals, contains, regex, is-json, llm-rubric, etc.
 */
export const promptfooAssertionSchema = z
  .object({
    type: z.string().min(1, "Assertion type cannot be empty"),
    value: z.unknown().optional(),
    threshold: z.number().optional(),
    weight: z.number().optional(),
    provider: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    rubricPrompt: z.union([z.string(), z.array(z.unknown())]).optional(),
    metric: z.string().optional(),
  })
  .catchall(z.unknown());

export type PromptfooAssertion = z.infer<typeof promptfooAssertionSchema>;

/**
 * Promptfoo Test Case Schema
 */
export const promptfooTestCaseSchema = z
  .object({
    description: z.string().optional(),
    vars: z.record(z.string(), z.unknown()).default({}),
    assert: z.array(promptfooAssertionSchema).optional().default([]),
    options: z.record(z.string(), z.unknown()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    tags: z.array(z.string()).optional().default([]),
  })
  .catchall(z.unknown());

export type PromptfooTestCase = z.infer<typeof promptfooTestCaseSchema>;

/**
 * Promptfoo Provider Schema (e.g. "openai:gpt-4o", or { id: "openai:gpt-4o", config: {...} })
 */
export const promptfooProviderObjectSchema = z
  .object({
    id: z.string().min(1, "Provider ID cannot be empty"),
    config: z.record(z.string(), z.unknown()).optional(),
    label: z.string().optional(),
  })
  .catchall(z.unknown());

export const promptfooProviderSchema = z.union([z.string(), promptfooProviderObjectSchema]);

export type PromptfooProvider = z.infer<typeof promptfooProviderSchema>;

/**
 * Promptfoo Prompt Schema (string template or object with id/raw)
 */
export const promptfooPromptObjectSchema = z
  .object({
    id: z.string().optional(),
    raw: z.string().optional(),
    label: z.string().optional(),
  })
  .catchall(z.unknown());

export const promptfooPromptSchema = z.union([z.string(), promptfooPromptObjectSchema]);

export type PromptfooPrompt = z.infer<typeof promptfooPromptSchema>;

/**
 * Promptfoo Root Config Schema (e.g. promptfooconfig.yaml)
 */
export const promptfooConfigSchema = z
  .object({
    description: z.string().optional(),
    prompts: z
      .union([promptfooPromptSchema, z.array(promptfooPromptSchema)])
      .transform((val) => (Array.isArray(val) ? val : [val])),
    providers: z
      .union([promptfooProviderSchema, z.array(promptfooProviderSchema)])
      .transform((val) => (Array.isArray(val) ? val : [val])),
    defaultTest: promptfooTestCaseSchema.optional(),
    tests: z
      .union([z.string(), z.array(promptfooTestCaseSchema)])
      .optional()
      .default([]),
    scenarios: z.array(z.unknown()).optional(),
    outputPath: z.string().optional(),
    env: z.record(z.string(), z.unknown()).optional(),
  })
  .catchall(z.unknown());

export type PromptfooConfig = z.infer<typeof promptfooConfigSchema>;
