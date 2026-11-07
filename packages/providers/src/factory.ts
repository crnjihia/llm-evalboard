import type { ModelConfig } from "@evalboard/core";
import { AnthropicProvider } from "./anthropic.js";
import type { ProviderCache } from "./cache.js";
import { MockProvider } from "./mock.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { Provider } from "./types.js";

export interface CreateProviderOptions {
  cache?: ProviderCache;
  anthropicApiKey?: string;
  openrouterApiKey?: string;
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
}

export function createProvider(config: ModelConfig, options: CreateProviderOptions = {}): Provider {
  const normProvider = config.provider.toLowerCase();

  if (normProvider === "mock") {
    return new MockProvider({ cache: options.cache });
  }

  if (normProvider === "anthropic") {
    return new AnthropicProvider({
      apiKey: options.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY,
      cache: options.cache,
    });
  }

  if (normProvider === "ollama") {
    const rawUrl = options.ollamaBaseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
    const baseUrl = rawUrl.endsWith("/v1") ? rawUrl : `${rawUrl.replace(/\/+$/, "")}/v1`;
    return new OpenAICompatibleProvider({
      name: "ollama",
      baseUrl,
      cache: options.cache,
    });
  }

  if (normProvider === "openrouter") {
    return new OpenAICompatibleProvider({
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: options.openrouterApiKey ?? process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        "HTTP-Referer": "https://github.com/llm-evalboard/llm-evalboard",
        "X-Title": "llm-evalboard",
      },
      cache: options.cache,
    });
  }

  // Generic OpenAI-compatible
  return new OpenAICompatibleProvider({
    name: normProvider,
    baseUrl: "https://api.openai.com/v1",
    apiKey: options.openaiApiKey ?? process.env.OPENAI_API_KEY,
    cache: options.cache,
  });
}
