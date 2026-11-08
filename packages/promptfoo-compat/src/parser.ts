import fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { type PromptfooConfig, promptfooConfigSchema, promptfooTestCaseSchema } from "./schema.js";

export interface ParseOptions {
  basePath?: string;
}

/**
 * Parses a raw YAML or JSON string into a validated PromptfooConfig.
 */
export function parsePromptfooConfigString(rawContent: string): PromptfooConfig {
  const parsedYaml = parseYaml(rawContent);
  return promptfooConfigSchema.parse(parsedYaml);
}

/**
 * Loads a Promptfoo configuration from disk, resolving any relative file:// prompt
 * or test references relative to the config file's directory.
 */
export async function loadPromptfooConfigFile(
  filePath: string,
  options?: ParseOptions,
): Promise<{ config: PromptfooConfig; resolvedPrompts: string[]; warnings: string[] }> {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const baseDir = options?.basePath ?? path.dirname(absolutePath);
  const rawContent = await fs.readFile(absolutePath, "utf-8");

  const config = parsePromptfooConfigString(rawContent);
  const warnings: string[] = [];

  // Resolve prompts if they use file://
  const resolvedPrompts: string[] = [];
  for (const p of config.prompts) {
    if (typeof p === "string") {
      if (p.startsWith("file://")) {
        const relativeFilePath = p.slice(7);
        const resolvedPath = path.resolve(baseDir, relativeFilePath);
        try {
          const fileContent = await fs.readFile(resolvedPath, "utf-8");
          resolvedPrompts.push(fileContent.trim());
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          warnings.push(`Failed to resolve prompt file '${p}': ${msg}`);
          resolvedPrompts.push(p);
        }
      } else {
        resolvedPrompts.push(p);
      }
    } else if (typeof p === "object" && p !== null) {
      if (p.raw) {
        resolvedPrompts.push(p.raw);
      } else if (p.id) {
        resolvedPrompts.push(p.id);
      }
    }
  }

  // Resolve external tests file if tests is a file path string (e.g. "file://tests.yaml")
  if (typeof config.tests === "string" && config.tests.startsWith("file://")) {
    const testsFilePath = path.resolve(baseDir, config.tests.slice(7));
    try {
      const testsRaw = await fs.readFile(testsFilePath, "utf-8");
      const parsedTests = parseYaml(testsRaw);
      if (Array.isArray(parsedTests)) {
        config.tests = parsedTests.map((t) => promptfooTestCaseSchema.parse(t));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to resolve external tests file '${config.tests}': ${msg}`);
      config.tests = [];
    }
  }

  return { config, resolvedPrompts, warnings };
}
