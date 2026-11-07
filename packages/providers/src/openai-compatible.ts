import { z } from "zod";
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

const chatCompletionResponseSchema = z.object({
  id: z.string().optional(),
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.string().optional(),
          content: z.string().nullable().optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative().optional(),
      completion_tokens: z.number().int().nonnegative().optional(),
      total_tokens: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export interface OpenAICompatibleOptions {
  baseUrl: string;
  apiKey?: string;
  name?: string;
  defaultHeaders?: Record<string, string>;
  cache?: ProviderCache;
  timeoutMs?: number;
  maxRetries?: number;
}

export class OpenAICompatibleProvider implements Provider {
  readonly name: string;
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly cache?: ProviderCache;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options: OpenAICompatibleOptions) {
    this.name = options.name ?? (options.baseUrl.includes("openrouter") ? "openrouter" : "openai");
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.cache = options.cache;
    this.timeoutMs = options.timeoutMs ?? 60000;
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

    const response = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        if (req.signal) {
          req.signal.addEventListener("abort", () => controller.abort(), { once: true });
        }

        try {
          const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...this.defaultHeaders,
          };

          if (this.apiKey) {
            headers.Authorization = `Bearer ${this.apiKey}`;
          }

          const body: Record<string, unknown> = {
            model: req.model,
            messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
          };

          if (req.params?.temperature !== undefined) {
            body.temperature = req.params.temperature;
          }
          if (req.params?.maxTokens !== undefined) {
            body.max_tokens = req.params.maxTokens;
          }
          if (req.params?.topP !== undefined) {
            body.top_p = req.params.topP;
          }
          if (req.params?.seed !== undefined) {
            body.seed = req.params.seed;
          }

          const res = await fetch(`${this.baseUrl}/chat/completions`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          if (!res.ok) {
            const errBody = await res.text().catch(() => "");
            let parsedMessage = errBody;
            try {
              const json = JSON.parse(errBody) as { error?: { message?: string } };
              if (json.error?.message) parsedMessage = json.error.message;
            } catch {
              // use raw errBody
            }
            throw new ProviderError(
              `API returned HTTP ${res.status}: ${parsedMessage}`,
              res.status === 429
                ? "rate_limit"
                : res.status >= 500
                  ? "provider_error"
                  : "invalid_request",
              res.status,
              errBody,
            );
          }

          const json = await res.json();
          const parsed = chatCompletionResponseSchema.safeParse(json);
          if (!parsed.success) {
            throw new ProviderError(
              `Invalid chat completion response schema: ${parsed.error.message}`,
              "provider_error",
              res.status,
              json,
            );
          }

          const choice = parsed.data.choices[0];
          const text = choice?.message.content ?? "";
          const finishReason = choice?.finish_reason ?? undefined;

          // Token usage
          const inputTokens = parsed.data.usage?.prompt_tokens ?? 0;
          const outputTokens = parsed.data.usage?.completion_tokens ?? 0;
          const totalTokens = parsed.data.usage?.total_tokens ?? inputTokens + outputTokens;
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
            finishReason: finishReason ?? "stop",
            raw: json,
          };

          return genResponse;
        } finally {
          clearTimeout(timeoutId);
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
