import { type ProviderCache, computeCacheKey } from "./cache.js";
import { resolveCapabilities } from "./capabilities.js";
import { estimateTokensCost } from "./pricing.js";
import type {
  GenerateRequest,
  GenerateResponse,
  ModelCapabilities,
  Provider,
  ProviderError,
} from "./types.js";

export interface MockProviderOptions {
  cache?: ProviderCache;
  defaultResponse?: string;
  scriptedResponses?: Record<string, string>;
  responseGenerator?: (req: GenerateRequest) => string;
  injectedError?: ProviderError;
  simulatedLatencyMs?: number;
}

export class MockProvider implements Provider {
  readonly name = "mock";
  private callCount = 0;

  constructor(private readonly options: MockProviderOptions = {}) {}

  getCallCount(): number {
    return this.callCount;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  getCapabilities(model: string): ModelCapabilities {
    return resolveCapabilities(this.name, model);
  }

  estimateCost(model: string, inputTokens: number, outputTokens: number): number {
    return estimateTokensCost(model, inputTokens, outputTokens).costUsd;
  }

  async generate(req: GenerateRequest): Promise<GenerateResponse> {
    const cacheKey = computeCacheKey({
      provider: this.name,
      model: req.model,
      messages: req.messages,
      params: req.params,
    });

    if (this.options.cache) {
      const cached = await this.options.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    if (req.signal?.aborted) {
      throw new Error("Request aborted");
    }

    if (this.options.injectedError) {
      throw this.options.injectedError;
    }

    this.callCount++;

    const lastMessage = req.messages[req.messages.length - 1]?.content ?? "";
    let responseText = this.options.defaultResponse ?? `Mock response for: ${lastMessage}`;

    const scripted = this.options.scriptedResponses?.[lastMessage];
    if (scripted) {
      responseText = scripted;
    } else if (this.options.responseGenerator) {
      responseText = this.options.responseGenerator(req);
    }

    // Estimate realistic tokens (approx 4 chars per token)
    const promptChars = req.messages.reduce((acc, m) => acc + m.content.length, 0);
    const inputTokens = Math.max(1, Math.round(promptChars / 4));
    const outputTokens = Math.max(1, Math.round(responseText.length / 4));
    const totalTokens = inputTokens + outputTokens;
    const costUsd = this.estimateCost(req.model, inputTokens, outputTokens);

    const response: GenerateResponse = {
      text: responseText,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        costUsd,
      },
      latencyMs: this.options.simulatedLatencyMs ?? 15,
      cached: false,
      finishReason: "stop",
      raw: { mock: true, model: req.model },
    };

    if (this.options.cache) {
      await this.options.cache.set(cacheKey, response);
    }

    return response;
  }
}
