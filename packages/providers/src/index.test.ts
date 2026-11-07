import { describe, expect, it } from "vitest";
import {
  AnthropicProvider,
  MockProvider,
  OpenAICompatibleProvider,
  PROVIDERS_PACKAGE_NAME,
  createProvider,
} from "./index.js";

describe("providers exports and factory", () => {
  it("exports package name and provider classes", () => {
    expect(PROVIDERS_PACKAGE_NAME).toBe("@evalboard/providers");
    expect(MockProvider).toBeDefined();
    expect(AnthropicProvider).toBeDefined();
    expect(OpenAICompatibleProvider).toBeDefined();
  });

  it("factory instantiates MockProvider for mock config", () => {
    const provider = createProvider({ provider: "mock", model: "echo" });
    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.name).toBe("mock");
  });

  it("factory instantiates AnthropicProvider for anthropic config", () => {
    const provider = createProvider({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
    });
    expect(provider).toBeInstanceOf(AnthropicProvider);
    expect(provider.name).toBe("anthropic");
  });

  it("factory instantiates OpenAICompatibleProvider for ollama config", () => {
    const provider = createProvider({
      provider: "ollama",
      model: "llama3",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("ollama");
  });

  it("factory instantiates OpenAICompatibleProvider for openrouter config", () => {
    const provider = createProvider({
      provider: "openrouter",
      model: "meta-llama/llama-3.3-70b-instruct",
    });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider.name).toBe("openrouter");
  });
});
