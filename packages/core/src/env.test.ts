import { describe, expect, it } from "vitest";
import { parseEnv } from "./env.js";

describe("env handling", () => {
  it("parses valid environment variables", () => {
    const parsed = parseEnv({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/evalboard",
      ANTHROPIC_API_KEY: "sk-ant-test-key",
      OPENROUTER_API_KEY: "sk-or-test-key",
      OLLAMA_BASE_URL: "http://localhost:11434",
      MAX_COST_USD: "25.50",
    });

    expect(parsed.DATABASE_URL).toBe("postgresql://postgres:postgres@localhost:5432/evalboard");
    expect(parsed.ANTHROPIC_API_KEY).toBe("sk-ant-test-key");
    expect(parsed.OPENROUTER_API_KEY).toBe("sk-or-test-key");
    expect(parsed.OLLAMA_BASE_URL).toBe("http://localhost:11434");
    expect(parsed.MAX_COST_USD).toBe(25.5);
  });

  it("handles empty / optional variables without crashing", () => {
    const parsed = parseEnv({});
    expect(parsed.MAX_COST_USD).toBeUndefined();
    expect(parsed.OLLAMA_BASE_URL).toBe("http://localhost:11434");
  });

  it("throws validation error for invalid numeric values", () => {
    expect(() =>
      parseEnv({
        MAX_COST_USD: "not-a-number",
      }),
    ).toThrow("Environment validation failed");
  });
});
