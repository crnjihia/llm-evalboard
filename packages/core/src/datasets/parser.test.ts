import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkSplitDiscipline,
  parseCsvDataset,
  parseDataset,
  parseJsonDataset,
  parseJsonlDataset,
} from "./parser.js";

describe("dataset parser and format detection", () => {
  it("parses valid JSONL dataset with tags and expected values", () => {
    const jsonl = `{"input": {"query": "What is 2+2?"}, "expected": "4", "tags": ["math", "easy"], "split": "test"}
{"input": {"query": "What is 5*5?"}, "expected": "25", "tags": "math,easy", "split": "dev"}`;

    const cases = parseJsonlDataset(jsonl);
    expect(cases).toHaveLength(2);
    expect(cases[0]?.input).toEqual({ query: "What is 2+2?" });
    expect(cases[0]?.expected).toBe("4");
    expect(cases[0]?.tags).toEqual(["math", "easy"]);
    expect(cases[0]?.split).toBe("test");
    expect(cases[0]?.id).toHaveLength(64);

    expect(cases[1]?.split).toBe("dev");
  });

  it("parses CSV dataset handling quotes and commas cleanly", () => {
    const csv = `question,category,expected,split
"What is Paris, France known for?",travel,"Eiffel Tower, cuisine",test
"Calculate 10,000 / 2",math,5000,test`;

    const cases = parseCsvDataset(csv);
    expect(cases).toHaveLength(2);
    expect(cases[0]?.input.question).toBe("What is Paris, France known for?");
    expect(cases[0]?.input.category).toBe("travel");
    expect(cases[0]?.expected).toBe("Eiffel Tower, cuisine");
    expect(cases[1]?.input.question).toBe("Calculate 10,000 / 2");
  });

  it("parses JSON array format", () => {
    const json = JSON.stringify([
      { input: { prompt: "Translate 'bonjour'" }, expected: "hello", tags: ["french"] },
      { input: { prompt: "Translate 'merci'" }, expected: "thank you", tags: ["french"] },
    ]);

    const cases = parseJsonDataset(json);
    expect(cases).toHaveLength(2);
    expect(cases[1]?.expected).toBe("thank you");
  });

  it("validates cases against dataset-level input schema", () => {
    const schema = z.object({
      id_number: z.number().int(),
      query: z.string().min(3),
    });

    const validJsonl = `{"input": {"id_number": 42, "query": "Valid text"}}`;
    expect(() => parseJsonlDataset(validJsonl, { inputSchema: schema })).not.toThrow();

    const invalidJsonl = `{"input": {"id_number": "not_an_int", "query": "x"}}`;
    expect(() => parseJsonlDataset(invalidJsonl, { inputSchema: schema })).toThrow(
      /failed input schema validation/,
    );
  });

  it("warns when tuning and reporting splits are identical", () => {
    const check1 = checkSplitDiscipline("test", "test");
    expect(check1.safe).toBe(false);
    expect(check1.warning).toContain("Split contamination warning");

    const check2 = checkSplitDiscipline("dev", "test");
    expect(check2.safe).toBe(true);
  });

  it("parseDataset automatically detects format and computes version hash", () => {
    const content = `{"input": {"x": 1}, "expected": 2}\n{"input": {"x": 2}, "expected": 4}`;
    const dataset = parseDataset(content);

    expect(dataset.totalCases).toBe(2);
    expect(dataset.versionId).toHaveLength(64);
    expect(dataset.splits.test).toBe(2);
  });
});
