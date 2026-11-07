import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { canonicalJson, sha256 } from "@evalboard/core";
import type { GenerateParams, GenerateResponse, Message } from "./types.js";

export interface CacheKeyInput {
  provider: string;
  model: string;
  messages: Message[];
  params?: GenerateParams;
}

export function computeCacheKey(input: CacheKeyInput): string {
  return sha256(
    canonicalJson({
      provider: input.provider.toLowerCase(),
      model: input.model.toLowerCase(),
      messages: input.messages,
      params: input.params ?? {},
    }),
  );
}

export interface ProviderCache {
  get(key: string): Promise<GenerateResponse | null>;
  set(key: string, response: GenerateResponse): Promise<void>;
  has(key: string): Promise<boolean>;
}

export class MemoryCache implements ProviderCache {
  private readonly store = new Map<string, GenerateResponse>();

  async get(key: string): Promise<GenerateResponse | null> {
    const found = this.store.get(key);
    if (!found) return null;
    return {
      ...found,
      cached: true,
      usage: {
        ...found.usage,
        originalCostUsd: found.usage.originalCostUsd ?? found.usage.costUsd,
        costUsd: 0,
      },
      latencyMs: 1, // simulated local cache retrieval latency
    };
  }

  async set(key: string, response: GenerateResponse): Promise<void> {
    this.store.set(key, { ...response });
  }

  async has(key: string): Promise<boolean> {
    return this.store.has(key);
  }
}

export class DiskCache implements ProviderCache {
  constructor(private readonly cacheDir: string = ".evalboard/cache") {}

  private getFilePath(key: string): string {
    return join(this.cacheDir, `${key}.json`);
  }

  async get(key: string): Promise<GenerateResponse | null> {
    try {
      const filePath = this.getFilePath(key);
      const content = readFileSync(filePath, "utf8");
      const parsed = JSON.parse(content) as GenerateResponse;
      return {
        ...parsed,
        cached: true,
        usage: {
          ...parsed.usage,
          originalCostUsd: parsed.usage.originalCostUsd ?? parsed.usage.costUsd,
          costUsd: 0,
        },
        latencyMs: 2,
      };
    } catch {
      return null;
    }
  }

  async set(key: string, response: GenerateResponse): Promise<void> {
    const filePath = this.getFilePath(key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(response, null, 2), "utf8");
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}
