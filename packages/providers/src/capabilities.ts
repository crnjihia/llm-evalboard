import type { ModelCapabilities } from "./types.js";

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsTemperature: true,
  supportsSeed: false,
  supportsSystemPrompt: true,
  supportsJsonMode: true,
  supportsToolUse: true,
};

export function resolveCapabilities(provider: string, model: string): ModelCapabilities {
  const normModel = model.toLowerCase();
  const normProvider = provider.toLowerCase();

  if (normProvider === "mock") {
    return {
      supportsTemperature: true,
      supportsSeed: true,
      supportsSystemPrompt: true,
      supportsJsonMode: true,
      supportsToolUse: true,
    };
  }

  if (normProvider === "anthropic" || normModel.includes("claude")) {
    return {
      supportsTemperature: true,
      // Anthropic API does not support deterministic seed parameters
      supportsSeed: false,
      supportsSystemPrompt: true,
      supportsJsonMode: true,
      supportsToolUse: true,
    };
  }

  if (normProvider === "ollama") {
    return {
      supportsTemperature: true,
      supportsSeed: true,
      supportsSystemPrompt: true,
      supportsJsonMode: true,
      supportsToolUse: false,
    };
  }

  // Default OpenAI / OpenRouter
  return {
    ...DEFAULT_CAPABILITIES,
    supportsSeed: true,
  };
}
