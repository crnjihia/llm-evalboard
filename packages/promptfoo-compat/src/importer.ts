import {
  type Case,
  type GraderConfig,
  type ModelConfig,
  type Suite,
  hashCaseContent,
  hashPromptContent,
  suiteSchema,
} from "@evalboard/core";
import { mapPromptfooAssertion, mapPromptfooProvider } from "./mapping.js";
import type { PromptfooConfig, PromptfooTestCase } from "./schema.js";
import type { MappingWarning } from "./warnings.js";

export interface ImportOptions {
  suiteName?: string;
  datasetName?: string;
  repeats?: number;
  delta?: number;
  resolvedPrompts?: string[];
}

export interface PromptEntity {
  id: string;
  name: string;
  template: string;
}

export interface ImportResult {
  suite: Suite;
  cases: Case[];
  prompts: PromptEntity[];
  graders: GraderConfig[];
  warnings: MappingWarning[];
}

/**
 * Imports a Promptfoo configuration object into Evalboard native entities:
 * Suite, Cases, Prompts, and Graders.
 */
export function importPromptfooConfig(
  config: PromptfooConfig,
  options: ImportOptions = {},
): ImportResult {
  const warnings: MappingWarning[] = [];

  // 1. Resolve prompts
  const rawPrompts =
    options.resolvedPrompts && options.resolvedPrompts.length > 0
      ? options.resolvedPrompts
      : config.prompts.map((p) => {
          if (typeof p === "string") return p;
          if (p.raw) return p.raw;
          if (p.id) return p.id;
          return "Default Prompt Template";
        });

  const promptEntities: PromptEntity[] = rawPrompts.map((template, idx) => {
    const id = hashPromptContent({ template });
    return {
      id,
      name: `prompt_${idx + 1}`,
      template,
    };
  });

  // 2. Resolve models/providers
  const models: ModelConfig[] = [];
  for (const prov of config.providers) {
    const { modelConfig, warning } = mapPromptfooProvider(prov);
    models.push(modelConfig);
    if (warning) {
      warnings.push(warning);
    }
  }

  if (models.length === 0) {
    models.push({ provider: "mock", model: "echo", parameters: {} });
  }

  // 3. Process test cases
  const defaultAssert = config.defaultTest?.assert ?? [];
  const defaultVars = config.defaultTest?.vars ?? {};

  const testList: PromptfooTestCase[] = Array.isArray(config.tests) ? config.tests : [];

  const cases: Case[] = [];
  const gradersMap = new Map<string, GraderConfig>();

  testList.forEach((test, idx) => {
    const mergedVars = { ...defaultVars, ...test.vars };
    const mergedAsserts = [...defaultAssert, ...(test.assert ?? [])];

    let expectedValue: unknown = undefined;

    for (const assertion of mergedAsserts) {
      const { grader, warning } = mapPromptfooAssertion(assertion, idx);
      if (warning) {
        warnings.push(warning);
      }
      if (grader) {
        const key = JSON.stringify(grader);
        gradersMap.set(key, grader);

        if (grader.type === "exact" && grader.config.expected !== undefined) {
          expectedValue = grader.config.expected;
        }
      }
    }

    const caseHash = hashCaseContent({
      input: mergedVars,
      expected: expectedValue,
      tags: test.tags ?? [],
      metadata: test.description ? { description: test.description } : null,
    });

    cases.push({
      id: caseHash,
      datasetVersionId: "0".repeat(64), // placeholder to be linked upon dataset versioning
      caseIndex: idx,
      input: mergedVars,
      expected: expectedValue,
      tags: test.tags ?? [],
      metadata: test.description ? { description: test.description } : null,
      split: "test",
      createdAt: new Date(),
    });
  });

  const graders = Array.from(gradersMap.values());

  // Default grader if none found
  if (graders.length === 0) {
    graders.push({
      type: "exact",
      name: "default_exact",
      config: { trim: true, caseFold: true },
    });
  }

  const baselineModel = models[0] ?? { provider: "mock", model: "echo" };
  const baselinePrompt = promptEntities[0]?.name ?? "prompt_1";

  const suiteData = {
    name: options.suiteName ?? config.description ?? "Imported Promptfoo Suite",
    description: config.description ?? "Migrated from Promptfoo configuration",
    prompts: promptEntities.map((p) => p.name),
    models,
    dataset: options.datasetName ?? "imported_promptfoo_dataset",
    repeats: options.repeats ?? 1,
    graders,
    baseline: {
      prompt: baselinePrompt,
      model: baselineModel.model,
    },
    delta: options.delta ?? 0.03,
  };

  const suite = suiteSchema.parse(suiteData);

  return {
    suite,
    cases,
    prompts: promptEntities,
    graders,
    warnings,
  };
}
