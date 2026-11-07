import Anthropic from "@anthropic-ai/sdk";
import { type ProviderCache, computeCacheKey } from "./cache.js";
import { resolveCapabilities } from "./capabilities.js";
import { estimateTokensCost } from "./pricing.js";
import { withRetry } from "./resilience.js";
import {
  type GenerateRequest,
  type GenerateResponse,
  type ModelCapabilities,
  type Provider,
  ProviderError,
} from "./types.js";

export interface AnthropicProviderOptions {
  apiKey?: string;
  cache?: ProviderCache;
  maxRetries?: number;
  client?: Anthropic;
}

export class AnthropicProvider implements Provider {
  readonly name = "anthropic";
  private readonly client: Anthropic;
  private readonly cache?: ProviderCache;
  private readonly maxRetries: number;

  constructor(options: AnthropicProviderOptions = {}) {
    this.client =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
      });
    this.cache = options.cache;
    this.maxRetries = options.maxRetries ?? 3;
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

    if (this.cache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const startTime = Date.now();

    // Extract system messages for Anthropic's top-level system parameter
    const systemMessages = req.messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");

    const nonSystemMessages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    if (nonSystemMessages.length === 0) {
      throw new ProviderError(
        "Anthropic API requires at least one non-system message",
        "invalid_request",
        400,
      );
    }

    const response = await withRetry(
      async () => {
        try {
          const maxTokens = (req.params?.maxTokens as number | undefined) ?? 4096;
          const temperature = req.params?.temperature as number | undefined;

          const res = await this.client.messages.create(
            {
              model: req.model,
              messages: nonSystemMessages,
              max_tokens: maxTokens,
              ...(systemMessages ? { system: systemMessages } : {}),
              ...(temperature !== undefined ? { temperature } : {}),
            },
            {
              signal: req.signal,
            },
          );

          // Extract text from content blocks
          const text = res.content
            .filter((block) => block.type === "text")
            .map((block) => (block as { text: string }).text)
            .join("");

          const inputTokens = res.usage.input_tokens;
          const outputTokens = res.usage.output_tokens;
          const totalTokens = inputTokens + outputTokens;
          const costUsd = this.estimateCost(req.model, inputTokens, outputTokens);
          const latencyMs = Math.max(1, Date.now() - startTime);

          const genResponse: GenerateResponse = {
            text,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens,
              costUsd,
            },
            latencyMs,
            cached: false,
            finishReason: res.stop_reason ?? "stop",
            raw: res,
          };

          return genResponse;
        } catch (err: unknown) {
          if (err instanceof Anthropic.APIError) {
            const status = err.status;
            const code =
              status === 429
                ? "rate_limit"
                : status && status >= 500
                  ? "provider_error"
                  : status === 400
                    ? "invalid_request"
                    : "provider_error";
            throw new ProviderError(err.message, code, status, err);
          }
          throw err;
        }
      },
      {
        maxRetries: this.maxRetries,
        signal: req.signal,
      },
    );

    if (this.cache) {
      await this.cache.set(cacheKey, response);
    }

    return response;
  }
}
