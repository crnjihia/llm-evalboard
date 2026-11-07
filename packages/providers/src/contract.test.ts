import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "./anthropic.js";
import { MockProvider } from "./mock.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { GenerateRequest, Provider } from "./types.js";

// Reusable contract test runner verifying the Provider interface invariant
function verifyProviderContract(name: string, createProvider: () => Provider) {
  describe(`Contract: ${name}`, () => {
    const provider = createProvider();

    it("exposes provider name and capabilities", () => {
      expect(provider.name).toBeDefined();
      const capabilities = provider.getCapabilities("test-model");
      expect(typeof capabilities.supportsTemperature).toBe("boolean");
      expect(typeof capabilities.supportsSeed).toBe("boolean");
      expect(typeof capabilities.supportsSystemPrompt).toBe("boolean");
    });

    it("estimates cost accurately", () => {
      const cost = provider.estimateCost("claude-3-5-sonnet-20241022", 1000, 500);
      expect(typeof cost).toBe("number");
      expect(cost).toBeGreaterThanOrEqual(0);
    });

    it("generates structured response adhering to GenerateResponse interface", async () => {
      const request: GenerateRequest = {
        model: "test-model",
        messages: [
          { role: "system", content: "You are a test assistant." },
          { role: "user", content: "Say hello" },
        ],
        params: { temperature: 0.0 },
      };

      const response = await provider.generate(request);

      expect(typeof response.text).toBe("string");
      expect(response.text.length).toBeGreaterThan(0);
      expect(response.usage).toBeDefined();
      expect(response.usage.inputTokens).toBeGreaterThan(0);
      expect(response.usage.outputTokens).toBeGreaterThan(0);
      expect(response.usage.totalTokens).toBeGreaterThanOrEqual(
        response.usage.inputTokens + response.usage.outputTokens,
      );
      expect(typeof response.usage.costUsd).toBe("number");
      expect(response.usage.costUsd).toBeGreaterThanOrEqual(0);
      expect(response.latencyMs).toBeGreaterThan(0);
      expect(typeof response.cached).toBe("boolean");
      expect(response.finishReason).toBeDefined();
    });
  });
}

// 1. MockProvider contract verification (Offline)
verifyProviderContract(
  "MockProvider",
  () => new MockProvider({ defaultResponse: "Hello from mock" }),
);

// 2. OpenAICompatibleProvider contract verification (Offline simulation)
verifyProviderContract("OpenAICompatibleProvider (Simulated)", () => {
  const provider = new OpenAICompatibleProvider({
    baseUrl: "http://localhost:11434/v1",
    name: "ollama",
  });

  // Mock global fetch for offline contract testing
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    return new Response(
      JSON.stringify({
        id: "chatcmpl-test",
        choices: [
          {
            message: { role: "assistant", content: "Hello from OpenAI-compatible provider" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 8,
          total_tokens: 23,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });

  return provider;
});

// 3. AnthropicProvider contract verification (Offline simulation)
verifyProviderContract("AnthropicProvider (Simulated)", () => {
  const mockClient = {
    messages: {
      create: vi.fn().mockResolvedValue({
        id: "msg_test",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Hello from Claude simulated" }],
        model: "claude-3-5-sonnet-20241022",
        stop_reason: "end_turn",
        usage: {
          input_tokens: 25,
          output_tokens: 10,
        },
      }),
    },
  } as unknown as Anthropic;

  return new AnthropicProvider({
    apiKey: "dummy-key",
    client: mockClient,
  });
});

// 4. Opt-in Live Provider Contract Tests (only executed if live API keys are explicitly present)
const LIVE_TESTS_ENABLED = process.env.RUN_LIVE_PROVIDER_TESTS === "true";

describe.runIf(LIVE_TESTS_ENABLED && !!process.env.ANTHROPIC_API_KEY)(
  "Live Anthropic Provider Contract",
  () => {
    verifyProviderContract("AnthropicProvider (Live)", () => new AnthropicProvider());
  },
);

describe.runIf(LIVE_TESTS_ENABLED && !!process.env.OPENROUTER_API_KEY)(
  "Live OpenRouter Provider Contract",
  () => {
    verifyProviderContract(
      "OpenRouter (Live)",
      () =>
        new OpenAICompatibleProvider({
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
          name: "openrouter",
        }),
    );
  },
);
