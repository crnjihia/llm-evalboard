import { z } from "zod";

export const messageRoleSchema = z.enum(["system", "user", "assistant"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  role: messageRoleSchema,
  content: z.string(),
});
export type Message = z.infer<typeof messageSchema>;

export const providerErrorCodeSchema = z.enum([
  "rate_limit",
  "timeout",
  "provider_error",
  "invalid_request",
  "refusal",
]);
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, code: ProviderErrorCode, status?: number, details?: unknown) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface ModelCapabilities {
  supportsTemperature: boolean;
  supportsSeed: boolean;
  supportsSystemPrompt: boolean;
  supportsJsonMode: boolean;
  supportsToolUse: boolean;
}

export interface GenerateParams {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  seed?: number;
  [key: string]: unknown;
}

export interface GenerateRequest {
  model: string;
  messages: Message[];
  params?: GenerateParams;
  signal?: AbortSignal;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  originalCostUsd?: number;
}

export interface GenerateResponse {
  text: string;
  usage: TokenUsage;
  latencyMs: number;
  cached: boolean;
  finishReason?: string;
  raw?: unknown;
}

export interface Provider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  getCapabilities(model: string): ModelCapabilities;
  estimateCost(model: string, inputTokens: number, outputTokens: number): number;
}
