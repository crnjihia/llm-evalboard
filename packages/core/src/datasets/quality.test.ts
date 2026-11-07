import { describe, expect, it } from "vitest";
import { parseJsonlDataset } from "./parser.js";
import { checkDatasetQuality } from "./quality.js";

describe("dataset quality checks", () => {
  it("flags planted exact duplicate cases in a fixture", () => {
    // Fixture with planted exact duplicate (cases 0 and 2 have identical query)
    const fixtureWithPlantedDuplicates = `{"input": {"query": "What is the capital of Kenya?"}, "expected": "Nairobi", "tags": ["geo"]}
{"input": {"query": "What is the boiling point of water?"}, "expected": "100 C", "tags": ["science"]}
{"input": {"query": "What is the capital of Kenya?"}, "expected": "Nairobi", "tags": ["geography"]}
{"input": {"query": "Who wrote Hamlet?"}, "expected": "Shakespeare", "tags": ["literature"]}`;

    const cases = parseJsonlDataset(fixtureWithPlantedDuplicates);
    const report = checkDatasetQuality(cases, { minRecommendedCases: 2 });

    expect(report.duplicatePairs).toHaveLength(1);
    expect(report.duplicatePairs[0]?.caseIndexA).toBe(0);
    expect(report.duplicatePairs[0]?.caseIndexB).toBe(2);
    expect(report.duplicatePairs[0]?.type).toBe("exact");
    expect(report.warnings.some((w) => w.includes("exact duplicates detected"))).toBe(true);
  });

  it("flags near-duplicate cases based on n-gram similarity", () => {
    const fixtureWithNearDuplicates = `{"input": {"query": "What is the capital city of France?"}}
{"input": {"query": "What is the capital of France?"}}`;

    const cases = parseJsonlDataset(fixtureWithNearDuplicates);
    const report = checkDatasetQuality(cases, {
      nearDuplicateThreshold: 0.7,
      minRecommendedCases: 2,
    });

    expect(report.nearDuplicatePairs).toHaveLength(1);
    expect(report.nearDuplicatePairs[0]?.type).toBe("near");
    expect(report.nearDuplicatePairs[0]?.similarity).toBeGreaterThanOrEqual(0.7);
  });

  it("emits small-sample warning when total cases are below threshold", () => {
    const smallFixture = `{"input": {"query": "One"}}
{"input": {"query": "Two"}}`;

    const cases = parseJsonlDataset(smallFixture);
    const report = checkDatasetQuality(cases, { minRecommendedCases: 30, delta: 0.03 });

    expect(
      report.warnings.some((w) => w.includes("Small sample size: Dataset contains 2 cases")),
    ).toBe(true);
  });

  it("computes label distribution, tag coverage, and input length statistics", () => {
    const fixture = `{"input": {"query": "short"}, "expected": "PASS", "tags": ["a", "b"]}
{"input": {"query": "a much longer query input for testing"}, "expected": "FAIL", "tags": ["b"]}
{"input": {"query": "medium query test"}, "expected": "PASS", "tags": []}`;

    const cases = parseJsonlDataset(fixture);
    const report = checkDatasetQuality(cases, { minRecommendedCases: 1 });

    expect(report.labelDistribution).toEqual({ PASS: 2, FAIL: 1 });
    expect(report.tagCoverage).toEqual({ a: 1, b: 2 });
    expect(report.untaggedCount).toBe(1);
    expect(report.inputLengthDistribution.min).toBe(5);
    expect(report.inputLengthDistribution.max).toBe(37);
    expect(report.inputLengthDistribution.median).toBe(17);
  });
});
