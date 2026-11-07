import { describe, expect, it } from "vitest";
import { classifyError, isRetryable, withRetry } from "./resilience.js";
import { ProviderError } from "./types.js";

describe("resilience and error classification", () => {
  it("classifies HTTP 429 and rate limit messages as rate_limit", () => {
    const err1 = classifyError({ status: 429, message: "Too many requests" });
    expect(err1.code).toBe("rate_limit");
    expect(err1.status).toBe(429);
    expect(isRetryable(err1.code)).toBe(true);

    const err2 = classifyError(new Error("Rate limit exceeded for organization"));
    expect(err2.code).toBe("rate_limit");
  });

  it("classifies HTTP 5xx and server errors as provider_error", () => {
    const err500 = classifyError({ status: 500, message: "Internal server error" });
    expect(err500.code).toBe("provider_error");
    expect(isRetryable(err500.code)).toBe(true);

    const err529 = classifyError({ status: 529, message: "Anthropic is overloaded" });
    expect(err529.code).toBe("provider_error");
    expect(isRetryable(err529.code)).toBe(true);
  });

  it("classifies HTTP 400 as non-retryable invalid_request", () => {
    const err400 = classifyError({
      status: 400,
      message: "Invalid parameter: temperature must be <= 1.0",
    });
    expect(err400.code).toBe("invalid_request");
    expect(isRetryable(err400.code)).toBe(false);
  });

  it("classifies timeout and abort errors as timeout", () => {
    const abortErr = new Error("This operation was aborted");
    abortErr.name = "AbortError";
    const classified = classifyError(abortErr);
    expect(classified.code).toBe("timeout");
  });

  it("retries on rate_limit and succeeds after transient failures", async () => {
    let callCount = 0;

    const result = await withRetry(
      async (attempt) => {
        callCount++;
        if (attempt < 2) {
          throw new ProviderError("Rate limit reached", "rate_limit", 429);
        }
        return "success";
      },
      {
        maxRetries: 3,
        initialDelayMs: 5,
        maxDelayMs: 20,
        jitterMs: 2,
      },
    );

    expect(result).toBe("success");
    expect(callCount).toBe(3); // 2 failures + 1 success
  });

  it("does not retry on invalid_request", async () => {
    let callCount = 0;

    await expect(
      withRetry(
        async () => {
          callCount++;
          throw new ProviderError("Bad schema", "invalid_request", 400);
        },
        {
          maxRetries: 3,
          initialDelayMs: 5,
        },
      ),
    ).rejects.toThrow("Bad schema");

    expect(callCount).toBe(1); // failed immediately on first attempt
  });
});
