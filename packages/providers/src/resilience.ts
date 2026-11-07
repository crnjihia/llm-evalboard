import { ProviderError, type ProviderErrorCode } from "./types.js";

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  signal?: AbortSignal;
}

export function classifyError(err: unknown): ProviderError {
  if (err instanceof ProviderError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: unknown }).status)
      : undefined;

  // Timeout / Abort
  if (
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("abort") ||
    (err instanceof Error && err.name === "AbortError")
  ) {
    return new ProviderError(message, "timeout", status, err);
  }

  // Rate limits
  if (
    status === 429 ||
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("too many requests") ||
    message.toLowerCase().includes("quota")
  ) {
    return new ProviderError(message, "rate_limit", status, err);
  }

  // Refusal
  if (
    message.toLowerCase().includes("refusal") ||
    message.toLowerCase().includes("content filter") ||
    message.toLowerCase().includes("policy violation")
  ) {
    return new ProviderError(message, "refusal", status, err);
  }

  // Invalid request
  if (
    status === 400 ||
    message.toLowerCase().includes("invalid request") ||
    message.toLowerCase().includes("context length exceeded") ||
    message.toLowerCase().includes("maximum context length")
  ) {
    return new ProviderError(message, "invalid_request", status, err);
  }

  // Server / Provider Error
  if (
    (status !== undefined && status >= 500) ||
    status === 529 ||
    message.toLowerCase().includes("overloaded") ||
    message.toLowerCase().includes("internal error") ||
    message.toLowerCase().includes("bad gateway")
  ) {
    return new ProviderError(message, "provider_error", status, err);
  }

  return new ProviderError(message, "provider_error", status, err);
}

export function isRetryable(code: ProviderErrorCode): boolean {
  return code === "rate_limit" || code === "provider_error";
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelayMs = options.initialDelayMs ?? 200;
  const maxDelayMs = options.maxDelayMs ?? 4000;
  const jitterMs = options.jitterMs ?? 100;

  let attempt = 0;

  while (true) {
    if (options.signal?.aborted) {
      throw new ProviderError("Request aborted", "timeout");
    }

    try {
      return await fn(attempt);
    } catch (err) {
      const classified = classifyError(err);
      attempt++;

      if (attempt > maxRetries || !isRetryable(classified.code)) {
        throw classified;
      }

      // Exponential backoff with jitter
      const exponentialDelay = initialDelayMs * 2 ** (attempt - 1);
      const jitter = Math.random() * jitterMs;
      const delay = Math.min(maxDelayMs, exponentialDelay + jitter);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, delay);
        if (options.signal) {
          options.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              reject(new ProviderError("Request aborted during backoff delay", "timeout"));
            },
            { once: true },
          );
        }
      });
    }
  }
}
