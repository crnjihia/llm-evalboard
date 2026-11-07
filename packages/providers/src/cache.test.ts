import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DiskCache, MemoryCache, computeCacheKey } from "./cache.js";
import { MockProvider } from "./mock.js";

describe("provider cache", () => {
  it("generates deterministic cache keys invariant to param declaration order", () => {
    const key1 = computeCacheKey({
      provider: "anthropic",
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "test query" }],
      params: { temperature: 0.7, maxTokens: 100 },
    });

    const key2 = computeCacheKey({
      provider: "Anthropic", // case insensitive
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user", content: "test query" }],
      params: { maxTokens: 100, temperature: 0.7 }, // swapped order
    });

    expect(key1).toBe(key2);
  });

  it("proves a second identical call makes zero network/provider requests (MemoryCache)", async () => {
    const cache = new MemoryCache();
    const provider = new MockProvider({ cache });

    const request = {
      model: "claude-3-5-sonnet-20241022",
      messages: [{ role: "user" as const, content: "Compute 2 + 2" }],
      params: { temperature: 0 },
    };

    // First call: makes actual call
    const res1 = await provider.generate(request);
    expect(res1.cached).toBe(false);
    expect(provider.getCallCount()).toBe(1);
    expect(res1.usage.costUsd).toBeGreaterThan(0);

    const initialCost = res1.usage.costUsd;

    // Second call with IDENTICAL parameters
    const res2 = await provider.generate(request);

    // Call count MUST stay 1 (zero new network/provider calls made!)
    expect(provider.getCallCount()).toBe(1);
    expect(res2.cached).toBe(true);
    expect(res2.text).toBe(res1.text);
    // Cache hits cost $0.00
    expect(res2.usage.costUsd).toBe(0);
    // Original cost is retained for what it WOULD have cost
    expect(res2.usage.originalCostUsd).toBe(initialCost);
  });

  it("persists and retrieves from DiskCache", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-cache-test-"));
    try {
      const diskCache = new DiskCache(tempDir);
      const provider = new MockProvider({ cache: diskCache });

      const request = {
        model: "mock-model",
        messages: [{ role: "user" as const, content: "Disk cache test query" }],
      };

      const res1 = await provider.generate(request);
      expect(res1.cached).toBe(false);
      expect(provider.getCallCount()).toBe(1);

      // New provider instance pointing to same disk cache
      const provider2 = new MockProvider({ cache: diskCache });
      const res2 = await provider2.generate(request);

      expect(provider2.getCallCount()).toBe(0);
      expect(res2.cached).toBe(true);
      expect(res2.usage.costUsd).toBe(0);
      expect(res2.text).toBe(res1.text);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
