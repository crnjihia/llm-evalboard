import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STATS_PACKAGE_NAME,
  SeededPRNG,
  bootstrapKappaCI,
  computeCohenKappa,
  computeLengthBias,
} from "./index.js";

describe("Statistics & Conformance (Phase 6 Acceptance Criteria)", () => {
  it("exports package name", () => {
    expect(STATS_PACKAGE_NAME).toBe("@evalboard/stats");
  });

  describe("SeededPRNG", () => {
    it("produces deterministic sequence given the same seed", () => {
      const prng1 = new SeededPRNG(12345);
      const prng2 = new SeededPRNG(12345);

      const seq1 = [prng1.next(), prng1.next(), prng1.next()];
      const seq2 = [prng2.next(), prng2.next(), prng2.next()];

      expect(seq1).toEqual(seq2);
    });

    it("samples with replacement deterministically", () => {
      const prng = new SeededPRNG("evalboard-seed");
      const items = [1, 2, 3, 4, 5];
      const sampled = prng.sampleWithReplacement(items, 10);
      expect(sampled).toHaveLength(10);
      expect(sampled.every((x) => items.includes(x))).toBe(true);
    });
  });

  describe("Cohen's Kappa Conformance Vectors (Phase 6 Acceptance Criterion)", () => {
    const vectorPath = resolve(__dirname, "../../../conformance/vectors/kappa.json");
    const vectorData = JSON.parse(readFileSync(vectorPath, "utf8"));

    for (const vec of vectorData.vectors) {
      it(`matches Python/scikit-learn vector: ${vec.id} (${vec.description})`, () => {
        const result = computeCohenKappa(vec.human, vec.judge, {
          categories: vec.categories,
          weights: "unweighted",
        });

        expect(result.rawAgreement).toBeCloseTo(vec.raw_agreement, 4);
        expect(result.kappa).toBeCloseTo(vec.expected_kappa_unweighted, 4);
        expect(result.confusionMatrix).toEqual(vec.expected_confusion_matrix);

        if (vec.expected_kappa_linear !== undefined) {
          const linearResult = computeCohenKappa(vec.human, vec.judge, {
            categories: vec.categories,
            weights: "linear",
          });
          expect(linearResult.kappa).toBeCloseTo(vec.expected_kappa_linear, 4);
        }

        if (vec.expected_kappa_quadratic !== undefined) {
          const quadResult = computeCohenKappa(vec.human, vec.judge, {
            categories: vec.categories,
            weights: "quadratic",
          });
          expect(quadResult.kappa).toBeCloseTo(vec.expected_kappa_quadratic, 4);
        }
      });
    }
  });

  describe("Bootstrap Kappa CI", () => {
    it("computes a reproducible percentile bootstrap CI using seeded PRNG", () => {
      const human = [1, 2, 3, 4, 5, 2, 3, 4, 3, 5, 1, 2, 4, 5, 3];
      const judge = [1, 2, 2, 4, 5, 3, 3, 5, 3, 4, 1, 1, 4, 5, 2];

      const ci1 = bootstrapKappaCI(human, judge, {
        weights: "linear",
        numResamples: 500,
        seed: 42,
      });

      const ci2 = bootstrapKappaCI(human, judge, {
        weights: "linear",
        numResamples: 500,
        seed: 42,
      });

      expect(ci1.estimate).toBe(ci2.estimate);
      expect(ci1.lower).toBe(ci2.lower);
      expect(ci1.upper).toBe(ci2.upper);
      expect(ci1.lower).toBeLessThanOrEqual(ci1.estimate);
      expect(ci1.estimate).toBeLessThanOrEqual(ci1.upper);
    });
  });

  describe("Length Bias Analysis", () => {
    it("detects significant length bias when judge scores correlate with token length", () => {
      const lengths = [50, 100, 150, 200, 250, 300, 350, 400];
      const scores = [1, 2, 2, 3, 4, 4, 5, 5]; // Strong positive correlation

      const report = computeLengthBias(lengths, scores, 0.35);
      expect(report.isBiased).toBe(true);
      expect(report.correlation).toBeGreaterThan(0.9);
      expect(report.explanation).toContain("Length bias detected");
    });

    it("reports no length bias when correlation is below threshold", () => {
      const lengths = [100, 200, 300, 400, 100, 200, 300, 400];
      const scores = [3, 3, 3, 3, 3, 3, 3, 3];

      const report = computeLengthBias(lengths, scores, 0.35);
      expect(report.isBiased).toBe(false);
      expect(report.correlation).toBe(0);
    });
  });
});
