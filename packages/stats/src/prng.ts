/**
 * Seeded Pseudo-Random Number Generator using the Mulberry32 algorithm.
 * Guarantees identical deterministic sequence across runs and platforms given the same seed.
 */
export class SeededPRNG {
  private state: number;

  constructor(seed: number | string = 42) {
    if (typeof seed === "string") {
      // Hash string seed to 32-bit unsigned integer
      let h = 2166136261 >>> 0;
      for (let i = 0; i < seed.length; i++) {
        h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
      }
      this.state = h >>> 0;
    } else {
      this.state = Math.floor(Math.abs(seed)) >>> 0;
    }
  }

  /**
   * Returns a float in [0, 1)
   */
  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Returns an integer in [min, max] inclusive
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Samples N elements with replacement from an array
   */
  sampleWithReplacement<T>(items: readonly T[], count = items.length): T[] {
    if (items.length === 0) return [];
    const result: T[] = new Array(count);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(this.next() * items.length);
      result[i] = items[idx] as T;
    }
    return result;
  }
}

/**
 * Convenience helper returning a deterministic next() function in [0, 1).
 */
export function createPrng(seed: number | string = 42): () => number {
  const prng = new SeededPRNG(seed);
  return () => prng.next();
}
