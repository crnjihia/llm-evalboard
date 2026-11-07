import { describe, expect, it } from "vitest";
import { estimateTokensCost, loadPricingTable } from "./pricing.js";

describe("pricing table and cost estimation", () => {
  it("loads default pricing table correctly", () => {
    const table = loadPricingTable();
    expect(table.models["claude-3-5-sonnet-20241022"]).toBeDefined();
    expect(table.models["claude-3-5-sonnet-20241022"]?.inputPerMillion).toBe(3.0);
    expect(table.models["claude-3-5-sonnet-20241022"]?.outputPerMillion).toBe(15.0);
  });

  it("matches hand-calculated cost example for Claude 3.5 Sonnet", () => {
    // Hand calculation:
    // Model: Claude 3.5 Sonnet ($3.00/1M input, $15.00/1M output)
    // Input: 1,000 tokens  -> (1,000 / 1,000,000) * 3.00  = 0.003 USD
    // Output: 500 tokens   -> (500 / 1,000,000) * 15.00  = 0.0075 USD
    // Total expected cost: 0.003 + 0.0075 = 0.0105 USD
    const inputTokens = 1000;
    const outputTokens = 500;

    const { costUsd, pricing } = estimateTokensCost(
      "claude-3-5-sonnet-20241022",
      inputTokens,
      outputTokens,
    );

    expect(pricing.inputPerMillion).toBe(3.0);
    expect(pricing.outputPerMillion).toBe(15.0);
    expect(costUsd).toBeCloseTo(0.0105, 6);
  });

  it("matches hand-calculated cost example for Claude 3.5 Haiku", () => {
    // Hand calculation:
    // Model: Claude 3.5 Haiku ($0.80/1M input, $4.00/1M output)
    // Input: 10,000 tokens  -> (10,000 / 1,000,000) * 0.80 = 0.008 USD
    // Output: 2,500 tokens  -> (2,500 / 1,000,000) * 4.00  = 0.010 USD
    // Total expected cost: 0.008 + 0.010 = 0.018 USD
    const inputTokens = 10000;
    const outputTokens = 2500;

    const { costUsd, pricing } = estimateTokensCost(
      "claude-3-5-haiku-20241022",
      inputTokens,
      outputTokens,
    );

    expect(pricing.inputPerMillion).toBe(0.8);
    expect(pricing.outputPerMillion).toBe(4.0);
    expect(costUsd).toBeCloseTo(0.018, 6);
  });

  it("local models default to 0 cost but allow custom compute cost estimate", () => {
    // Default local model = 0
    const zeroCost = estimateTokensCost("ollama:llama3", 5000, 2000);
    expect(zeroCost.costUsd).toBe(0);

    // With compute cost estimate of $0.05 / 1M tokens:
    // (7000 / 1,000,000) * 0.05 = 0.00035 USD
    const withCompute = estimateTokensCost("ollama:llama3", 5000, 2000, {
      localComputeCostPerMillion: 0.05,
    });
    expect(withCompute.costUsd).toBeCloseTo(0.00035, 6);
  });
});
