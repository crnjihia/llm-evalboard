import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const modelPricingSchema = z.object({
  inputPerMillion: z.number().nonnegative(),
  outputPerMillion: z.number().nonnegative(),
  source: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type ModelPricing = z.infer<typeof modelPricingSchema>;

export const pricingTableSchema = z.object({
  models: z.record(modelPricingSchema),
});

export type PricingTable = z.infer<typeof pricingTableSchema>;

let cachedPricingTable: PricingTable | null = null;

export function loadPricingTable(customYamlPath?: string): PricingTable {
  if (cachedPricingTable && !customYamlPath) {
    return cachedPricingTable;
  }

  let yamlContent: string;
  if (customYamlPath) {
    yamlContent = readFileSync(customYamlPath, "utf8");
  } else {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(currentDir, "pricing.yaml"),
      join(currentDir, "../src/pricing.yaml"),
      join(currentDir, "../../providers/src/pricing.yaml"),
      join(process.cwd(), "packages/providers/src/pricing.yaml"),
      join(process.cwd(), "../providers/src/pricing.yaml"),
      join(process.cwd(), "src/pricing.yaml"),
    ];

    let foundPath: string | undefined;
    for (const c of candidates) {
      if (existsSync(c)) {
        foundPath = c;
        break;
      }
    }

    if (foundPath) {
      yamlContent = readFileSync(foundPath, "utf8");
    } else {
      const fallbackTable: PricingTable = {
        models: {
          "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
          "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
          "claude-3-5-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
          "claude-3-7-sonnet": { inputPerMillion: 3, outputPerMillion: 15 },
          echo: { inputPerMillion: 0, outputPerMillion: 0 },
        },
      };
      if (!customYamlPath) {
        cachedPricingTable = fallbackTable;
      }
      return fallbackTable;
    }
  }

  const raw = parseYaml(yamlContent);
  const parsed = pricingTableSchema.parse(raw);
  if (!customYamlPath) {
    cachedPricingTable = parsed;
  }
  return parsed;
}

export interface CostEstimateOptions {
  localComputeCostPerMillion?: number;
}

export function findModelPricing(
  model: string,
  pricingTable: PricingTable = loadPricingTable(),
): ModelPricing | null {
  const norm = model.toLowerCase();

  // Direct lookup
  if (pricingTable.models[model]) {
    return pricingTable.models[model];
  }

  // Case-insensitive lookup
  for (const [key, value] of Object.entries(pricingTable.models)) {
    if (key.toLowerCase() === norm) {
      return value;
    }
  }

  // Model prefix matching (e.g. claude-3-5-sonnet matches claude-3-5-sonnet-20241022)
  if (norm.includes("claude-3-5-sonnet") || norm.includes("claude-3.5-sonnet")) {
    return pricingTable.models["claude-3-5-sonnet-20241022"] ?? null;
  }
  if (norm.includes("claude-3-7-sonnet") || norm.includes("claude-3.7-sonnet")) {
    return pricingTable.models["claude-3-7-sonnet-20250219"] ?? null;
  }
  if (norm.includes("claude-3-5-haiku") || norm.includes("claude-3.5-haiku")) {
    return pricingTable.models["claude-3-5-haiku-20241022"] ?? null;
  }
  if (norm.includes("claude-3-opus")) {
    return pricingTable.models["claude-3-opus-20240229"] ?? null;
  }

  return null;
}

/**
 * Calculates USD cost from input and output tokens.
 * Formula: (inputTokens / 1,000,000) * inputPerMillion + (outputTokens / 1,000,000) * outputPerMillion
 */
export function estimateTokensCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  options?: CostEstimateOptions,
): { costUsd: number; pricing: ModelPricing } {
  const pricing = findModelPricing(model);

  if (!pricing) {
    const isLocal =
      model.toLowerCase().startsWith("ollama") || model.toLowerCase().startsWith("mock");
    const localRate = isLocal ? (options?.localComputeCostPerMillion ?? 0.0) : 0.0;
    const fallbackPricing: ModelPricing = {
      inputPerMillion: localRate,
      outputPerMillion: localRate,
      source: isLocal ? "local-compute-estimate" : "unknown-fallback",
    };
    const costUsd =
      (inputTokens / 1_000_000) * fallbackPricing.inputPerMillion +
      (outputTokens / 1_000_000) * fallbackPricing.outputPerMillion;
    return { costUsd, pricing: fallbackPricing };
  }

  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion;

  return { costUsd, pricing };
}
