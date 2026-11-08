import { describe, expect, it } from "vitest";
import {
  createPrng,
  generateSyntheticVariations,
  injectMinorTypo,
  perturbPromptStyle,
  substituteEntities,
} from "./synthetic.js";

describe("Synthetic Perturbation Engine", () => {
  describe("createPrng", () => {
    it("is completely deterministic given identical seeds", () => {
      const rng1 = createPrng(12345);
      const rng2 = createPrng(12345);

      const seq1 = [rng1(), rng1(), rng1(), rng1()];
      const seq2 = [rng2(), rng2(), rng2(), rng2()];

      expect(seq1).toEqual(seq2);
    });

    it("produces different sequences for different seeds", () => {
      const rng1 = createPrng(100);
      const rng2 = createPrng(200);

      expect(rng1()).not.toEqual(rng2());
    });
  });

  describe("Perturbation Operators", () => {
    it("substitutes entities such as names, locations, and years", () => {
      const rng = createPrng(42);
      const text = "Alice visited Tokyo in 2023.";
      const perturbed = substituteEntities(text, rng);

      expect(perturbed).not.toBe(text);
      expect(perturbed).toMatch(/\b(202[0-9])\b/);
    });

    it("injects minor typos in target words", () => {
      const rng = createPrng(42);
      const text = "Please generate an evaluation summary.";
      const perturbed = injectMinorTypo(text, rng);

      expect(typeof perturbed).toBe("string");
      expect(perturbed.split(" ").length).toBe(text.split(" ").length);
    });

    it("perturbs prompt style with prefixes or punctuation", () => {
      const rng = createPrng(42);
      const text = "What is the capital of Kenya";
      const perturbed = perturbPromptStyle(text, rng);

      expect(perturbed).not.toBe(text);
    });
  });

  describe("generateSyntheticVariations", () => {
    it("generates k reproducible variations without mutating baseInput", () => {
      const base = {
        question: "Alice wants to know the flight schedule from London to Tokyo in 2024.",
        category: "travel",
      };
      const baseCopy = JSON.parse(JSON.stringify(base));

      const variations = generateSyntheticVariations(base, 3, 42);

      expect(variations.length).toBe(3);
      expect(base).toEqual(baseCopy); // unmutated

      for (let i = 0; i < variations.length; i++) {
        const v = variations[i];
        expect(v?.variationIndex).toBe(i + 1);
        expect(v?.input.category).toBe("travel");
        expect(typeof v?.input.question).toBe("string");
      }
    });
  });
});
