import { describe, expect, it } from "vitest";
import { canonicalJson, hashCanonical } from "./canonical.js";
import {
  hashCaseContent,
  hashDatasetVersion,
  hashGraderContent,
  hashPromptContent,
} from "./hashing.js";

describe("canonical JSON serializer", () => {
  it("sorts object keys alphabetically regardless of declaration order", () => {
    const objA = { z: 100, b: "hello", a: true };
    const objB = { a: true, z: 100, b: "hello" };

    expect(canonicalJson(objA)).toBe(canonicalJson(objB));
    expect(canonicalJson(objA)).toBe('{"a":true,"b":"hello","z":100}');
    expect(hashCanonical(objA)).toBe(hashCanonical(objB));
  });

  it("recursively sorts keys in nested objects", () => {
    const nested1 = {
      level1: { beta: [1, 2], alpha: { d: 4, c: 3 } },
      meta: { tag: "test" },
    };
    const nested2 = {
      meta: { tag: "test" },
      level1: { alpha: { c: 3, d: 4 }, beta: [1, 2] },
    };

    expect(canonicalJson(nested1)).toBe(canonicalJson(nested2));
    expect(hashCanonical(nested1)).toBe(hashCanonical(nested2));
  });

  it("preserves array order while sorting keys within array elements", () => {
    const arrayWithObjs1 = [
      { y: 2, x: 1 },
      { b: 4, a: 3 },
    ];
    const arrayWithObjs2 = [
      { x: 1, y: 2 },
      { a: 3, b: 4 },
    ];

    expect(canonicalJson(arrayWithObjs1)).toBe(canonicalJson(arrayWithObjs2));

    // Changing array order MUST change canonical output
    const reversedArray = [
      { a: 3, b: 4 },
      { x: 1, y: 2 },
    ];
    expect(canonicalJson(arrayWithObjs1)).not.toBe(canonicalJson(reversedArray));
  });

  it("handles null, dates, and omits undefined properties", () => {
    const date = new Date("2026-11-08T00:00:00.000Z");
    const withUndefined = { b: null, a: date, c: undefined };
    const withoutUndefined = { a: date, b: null };

    expect(canonicalJson(withUndefined)).toBe(canonicalJson(withoutUndefined));
    expect(canonicalJson(withUndefined)).toBe('{"a":"2026-11-08T00:00:00.000Z","b":null}');
  });

  it("normalises unicode characters to NFC", () => {
    // \u00e9 is 'é' precomposed, 'e\u0301' is 'e' + combining acute accent
    const precomposed = { text: "\u00e9" };
    const decomposed = { text: "e\u0301" };

    expect(canonicalJson(precomposed)).toBe(canonicalJson(decomposed));
    expect(hashCanonical(precomposed)).toBe(hashCanonical(decomposed));
  });

  it("normalises -0 to 0", () => {
    expect(canonicalJson({ val: -0 })).toBe('{"val":0}');
    expect(canonicalJson({ val: -0 })).toBe(canonicalJson({ val: 0 }));
  });

  it("throws on NaN or Infinity", () => {
    expect(() => canonicalJson({ val: Number.NaN })).toThrow("Cannot canonically serialise");
    expect(() => canonicalJson({ val: Number.POSITIVE_INFINITY })).toThrow(
      "Cannot canonically serialise",
    );
  });
});

describe("content-addressed hashing utilities", () => {
  it("computes reproducible hash for prompt content", () => {
    const prompt1 = {
      template: "You are a helpful assistant: {{question}}",
      variablesSchema: { question: "string" },
    };
    const prompt2 = {
      variablesSchema: { question: "string" },
      template: "You are a helpful assistant: {{question}}",
    };

    const hash1 = hashPromptContent(prompt1);
    const hash2 = hashPromptContent(prompt2);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // sha256 hex length

    // Any alteration produces a different hash
    const altered = hashPromptContent({
      ...prompt1,
      template: "You are a helpful assistant: {{question}}.",
    });
    expect(altered).not.toBe(hash1);
  });

  it("computes reproducible hash for case content", () => {
    const case1 = {
      input: { query: "What is 2+2?" },
      expected: "4",
      tags: ["math", "arithmetic"],
    };
    const case2 = {
      tags: ["arithmetic", "math"], // tags order sorted automatically
      expected: "4",
      input: { query: "What is 2+2?" },
    };

    expect(hashCaseContent(case1)).toBe(hashCaseContent(case2));
  });

  it("computes dataset version hash from ordered case hashes", () => {
    const caseHashes = ["hash_case_1", "hash_case_2", "hash_case_3"];
    const versionHashA = hashDatasetVersion(caseHashes);
    const versionHashB = hashDatasetVersion([...caseHashes]);

    expect(versionHashA).toBe(versionHashB);

    // Reordering cases in dataset changes dataset version hash
    const reordered = hashDatasetVersion(["hash_case_2", "hash_case_1", "hash_case_3"]);
    expect(reordered).not.toBe(versionHashA);
  });

  it("computes grader version hash", () => {
    const graderA = {
      type: "exact",
      config: { caseSensitive: false, trim: true },
    };
    const graderB = {
      config: { trim: true, caseSensitive: false },
      type: "exact",
    };

    expect(hashGraderContent(graderA)).toBe(hashGraderContent(graderB));
  });
});
