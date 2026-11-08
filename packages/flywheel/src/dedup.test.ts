import { describe, expect, it } from "vitest";
import {
  clusterTraces,
  computeJaccardSimilarity,
  extractWordNGrams,
  isDuplicate,
  tokenizeWords,
} from "./dedup.js";

describe("Deduplication & Clustering Engine", () => {
  describe("Tokenization & N-grams", () => {
    it("tokenizes words and removes punctuation", () => {
      const tokens = tokenizeWords("Hello, world! What's the capital of France?");
      expect(tokens).toEqual(["hello", "world", "what", "s", "the", "capital", "of", "france"]);
    });

    it("extracts word n-grams correctly", () => {
      const tokens = ["the", "quick", "brown", "fox"];
      const ngrams = extractWordNGrams(tokens, 2);
      expect(ngrams).toEqual(
        new Set(["the", "quick", "brown", "fox", "the quick", "quick brown", "brown fox"]),
      );
    });
  });

  describe("computeJaccardSimilarity", () => {
    it("returns 1.0 for identical sentences", () => {
      const text = "How do I reset my account password?";
      expect(computeJaccardSimilarity(text, text)).toBe(1.0);
    });

    it("returns 0.0 for completely disjoint sentences", () => {
      const textA = "apple banana orange";
      const textB = "car truck motorcycle";
      expect(computeJaccardSimilarity(textA, textB)).toBe(0.0);
    });

    it("returns high similarity for minor lexical variations", () => {
      const textA = "How do I reset my password on the portal?";
      const textB = "How do I reset my account password on the portal?";
      const sim = computeJaccardSimilarity(textA, textB);
      expect(sim).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe("isDuplicate", () => {
    const existingCases = [
      "What is the refund policy for annual subscriptions?",
      "Can I export my project data as CSV?",
      "How do I update my billing credit card?",
    ];

    it("flags near-duplicate queries above threshold", () => {
      const candidate = "What is your refund policy for annual subscriptions?";
      const result = isDuplicate(candidate, existingCases, 0.65);
      expect(result.isDuplicate).toBe(true);
      expect(result.matchedText).toBe(existingCases[0]);
      expect(result.maxSimilarity).toBeGreaterThanOrEqual(0.65);
    });

    it("permits novel queries below threshold", () => {
      const candidate = "How do I connect my Slack workspace via webhook?";
      const result = isDuplicate(candidate, existingCases, 0.65);
      expect(result.isDuplicate).toBe(false);
      expect(result.maxSimilarity).toBeLessThan(0.65);
    });
  });

  describe("clusterTraces", () => {
    it("groups similar traces into clusters and separates novel ones", () => {
      const traces = [
        { id: "t1", text: "How do I reset my password?" },
        { id: "t2", text: "How do I reset my user password?" },
        { id: "t3", text: "Where can I reset my account password?" },
        { id: "t4", text: "What is your pricing tier for enterprise?" },
        { id: "t5", text: "What is your enterprise pricing tier?" },
        { id: "t6", text: "System error 500 when uploading PDF" },
      ];

      const clusters = clusterTraces(traces, 0.4);

      // Should produce clusters for password, enterprise pricing, and error
      expect(clusters.length).toBeGreaterThanOrEqual(3);

      const passwordCluster = clusters.find((c) => c.traceIds.includes("t1"));
      expect(passwordCluster?.traceIds).toContain("t2");

      const pricingCluster = clusters.find((c) => c.traceIds.includes("t4"));
      expect(pricingCluster?.traceIds).toContain("t5");
    });
  });
});
