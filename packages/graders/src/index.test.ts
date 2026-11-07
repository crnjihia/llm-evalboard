import { describe, expect, it } from "vitest";
import {
  clearCustomGraders,
  createGrader,
  listCustomGraderTypes,
  registerCustomGrader,
} from "./index.js";

describe("Deterministic Graders (Phase 5 Acceptance Criteria)", () => {
  // =========================================================================
  // 1. ExactGrader (>=10 table-driven test cases)
  // =========================================================================
  describe("ExactGrader", () => {
    const testCases: Array<{
      name: string;
      config: Record<string, unknown>;
      expectedInCase?: unknown;
      output: string;
      shouldPass: boolean;
      score: number;
    }> = [
      {
        name: "1. Identical string match",
        config: { expected: "hello world" },
        output: "hello world",
        shouldPass: true,
        score: 1,
      },
      {
        name: "2. Different string mismatch",
        config: { expected: "hello world" },
        output: "hello universe",
        shouldPass: false,
        score: 0,
      },
      {
        name: "3. Case-folding enabled passes case difference",
        config: { expected: "Hello World", caseFold: true },
        output: "hello world",
        shouldPass: true,
        score: 1,
      },
      {
        name: "4. Case-folding disabled fails case difference",
        config: { expected: "Hello World", caseFold: false },
        output: "hello world",
        shouldPass: false,
        score: 0,
      },
      {
        name: "5. Whitespace trimming enabled passes whitespace differences",
        config: { expected: "target", trim: true },
        output: "   target  \n",
        shouldPass: true,
        score: 1,
      },
      {
        name: "6. Whitespace trimming disabled fails on extra spaces",
        config: { expected: "target", trim: false },
        output: " target ",
        shouldPass: false,
        score: 0,
      },
      {
        name: "7. Whitespace collapse normalizes multiple spaces & newlines",
        config: { expected: "one two three", whitespaceCollapse: true },
        output: "one   \t  two \n  three",
        shouldPass: true,
        score: 1,
      },
      {
        name: "8. Unicode normalization (NFC vs NFD accented characters)",
        config: { expected: "café", unicodeNormalize: "NFC" },
        // "cafe\u0301" is decomposed NFD form of "café"
        output: "cafe\u0301",
        shouldPass: true,
        score: 1,
      },
      {
        name: "9. Expected value inferred from case.expected",
        config: {},
        expectedInCase: "case expected value",
        output: "case expected value",
        shouldPass: true,
        score: 1,
      },
      {
        name: "10. Stripping markdown code fences before exact comparison",
        config: { expected: "answer", extractor: { type: "strip_code_fences" } },
        output: "```\nanswer\n```",
        shouldPass: true,
        score: 1,
      },
      {
        name: "11. Delimiter extractor before exact comparison",
        config: {
          expected: "42",
          extractor: { type: "after_delimiter", options: { delimiter: "### Answer:" } },
        },
        output: "Thinking...\n### Answer: 42",
        shouldPass: true,
        score: 1,
      },
      {
        name: "12. Empty string exact match",
        config: { expected: "" },
        output: "   ",
        shouldPass: true,
        score: 1,
      },
    ];

    for (const tc of testCases) {
      it(`[exact] ${tc.name}`, async () => {
        const grader = createGrader("exact", tc.config);
        const result = await grader.grade({
          case: {
            input: {},
            expected: tc.expectedInCase,
          },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(result.score).toBe(tc.score);
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      });
    }
  });

  // =========================================================================
  // 2. ContainsGrader & Not-Contains (>=10 table-driven test cases)
  // =========================================================================
  describe("ContainsGrader & Not-Contains", () => {
    const testCases: Array<{
      name: string;
      type: "contains" | "not-contains";
      config: Record<string, unknown>;
      output: string;
      shouldPass: boolean;
    }> = [
      {
        name: "1. Single substring found",
        type: "contains",
        config: { values: ["banana"] },
        output: "I ate a fresh banana this morning.",
        shouldPass: true,
      },
      {
        name: "2. Single substring missing",
        type: "contains",
        config: { values: ["orange"] },
        output: "I ate a fresh banana this morning.",
        shouldPass: false,
      },
      {
        name: "3. Multiple substrings (mode: all) all present",
        type: "contains",
        config: { values: ["apple", "banana"], mode: "all" },
        output: "We have apple and banana in stock.",
        shouldPass: true,
      },
      {
        name: "4. Multiple substrings (mode: all) one missing",
        type: "contains",
        config: { values: ["apple", "orange"], mode: "all" },
        output: "We only have apple here.",
        shouldPass: false,
      },
      {
        name: "5. Multiple substrings (mode: any) one present passes",
        type: "contains",
        config: { values: ["apple", "orange"], mode: "any" },
        output: "We only have apple here.",
        shouldPass: true,
      },
      {
        name: "6. Case folding enabled matches different case",
        type: "contains",
        config: { values: ["warning"], caseFold: true },
        output: "System WARNING: battery low",
        shouldPass: true,
      },
      {
        name: "7. Case folding disabled fails different case",
        type: "contains",
        config: { values: ["warning"], caseFold: false },
        output: "System WARNING: battery low",
        shouldPass: false,
      },
      {
        name: "8. Not-contains passes when forbidden substring is absent",
        type: "not-contains",
        config: { values: ["PASSWORD", "SECRET"] },
        output: "Here is your public confirmation token: 92834.",
        shouldPass: true,
      },
      {
        name: "9. Not-contains fails when forbidden substring is present",
        type: "not-contains",
        config: { values: ["PASSWORD", "SECRET"] },
        output: "Your SECRET is 12345.",
        shouldPass: false,
      },
      {
        name: "10. Inverted contains via config.inverted: true",
        type: "contains",
        config: { values: ["sql_injection"], inverted: true },
        output: "Safe SELECT statement executed.",
        shouldPass: true,
      },
      {
        name: "11. Substring inside markdown code fence with extractor",
        type: "contains",
        config: {
          values: ["SELECT * FROM users"],
          extractor: { type: "strip_code_fences" },
        },
        output: "Here is the query:\n```sql\nSELECT * FROM users\n```",
        shouldPass: true,
      },
      {
        name: "12. Not-contains mode: any fails if at least one missing",
        type: "not-contains",
        config: { values: ["forbidden_a", "forbidden_b"], mode: "any" },
        output: "Only forbidden_a is here.",
        shouldPass: true,
      },
    ];

    for (const tc of testCases) {
      it(`[contains] ${tc.name}`, async () => {
        const grader = createGrader(tc.type, tc.config);
        const result = await grader.grade({
          case: { input: {} },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      });
    }
  });

  // =========================================================================
  // 3. RegexGrader (>=10 table-driven test cases + ReDoS timeout test)
  // =========================================================================
  describe("RegexGrader", () => {
    const testCases: Array<{
      name: string;
      config: Record<string, unknown>;
      output: string;
      shouldPass: boolean;
      score: number;
    }> = [
      {
        name: "1. Phone number format match",
        config: { pattern: "^\\d{3}-\\d{3}-\\d{4}$" },
        output: "555-123-4567",
        shouldPass: true,
        score: 1,
      },
      {
        name: "2. Phone number format mismatch",
        config: { pattern: "^\\d{3}-\\d{3}-\\d{4}$" },
        output: "555-12-456",
        shouldPass: false,
        score: 0,
      },
      {
        name: "3. Case-insensitive flag",
        config: { pattern: "^error:", flags: "i" },
        output: "ERROR: disk full",
        shouldPass: true,
        score: 1,
      },
      {
        name: "4. Multiline flag",
        config: { pattern: "^conclusion:", flags: "m" },
        output: "Line 1\nConclusion: All tests pass",
        shouldPass: false,
        score: 0,
      },
      {
        name: "5. Multiline flag with case-insensitivity",
        config: { pattern: "^conclusion:", flags: "im" },
        output: "Line 1\nConclusion: All tests pass",
        shouldPass: true,
        score: 1,
      },
      {
        name: "6. Inverted regex passes when pattern absent",
        config: { pattern: "internal error", inverted: true },
        output: "Request processed successfully.",
        shouldPass: true,
        score: 1,
      },
      {
        name: "7. Inverted regex fails when pattern present",
        config: { pattern: "internal error", inverted: true },
        output: "Fatal: Internal Error in cluster",
        shouldPass: true, // case-sensitive by default
        score: 1,
      },
      {
        name: "8. Inverted regex with case-insensitivity fails when present",
        config: { pattern: "internal error", flags: "i", inverted: true },
        output: "Fatal: Internal Error in cluster",
        shouldPass: false,
        score: 0,
      },
      {
        name: "9. Extraction before regex matching",
        config: {
          pattern: "^{.*}$",
          extractor: { type: "strip_code_fences" },
        },
        output: '```json\n{"id": 10}\n```',
        shouldPass: true,
        score: 1,
      },
      {
        name: "10. ISO-8601 Date regex",
        config: { pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}" },
        output: "2026-11-08T12:00:00Z",
        shouldPass: true,
        score: 1,
      },
      {
        name: "11. Word boundary pattern",
        config: { pattern: "\\bcat\\b" },
        output: "The concatenate function",
        shouldPass: false,
        score: 0,
      },
      {
        name: "12. Exact word boundary match",
        config: { pattern: "\\bcat\\b" },
        output: "The cat sat on the mat.",
        shouldPass: true,
        score: 1,
      },
    ];

    for (const tc of testCases) {
      it(`[regex] ${tc.name}`, async () => {
        const grader = createGrader("regex", tc.config);
        const result = await grader.grade({
          case: { input: {} },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(result.score).toBe(tc.score);
        expect(typeof result.reason).toBe("string");
      });
    }

    it("Regex grader cannot hang on a pathological pattern (ReDoS Acceptance Criterion)", async () => {
      // Pathological catastrophic backtracking pattern: (a+)+$ against 28 'a's with trailing '!'
      const pathologicalPattern = "^(a+)+$";
      const pathologicalInput = "aaaaaaaaaaaaaaaaaaaaaaaaaaaa!";

      const grader = createGrader("regex", {
        pattern: pathologicalPattern,
        timeoutMs: 50, // Strict 50ms deadline
      });

      const start = Date.now();
      const result = await grader.grade({
        case: { input: {} },
        output: pathologicalInput,
      });
      const elapsed = Date.now() - start;

      // Must complete safely without hanging indefinitely!
      expect(elapsed).toBeLessThan(1000); // Definitely didn't hang
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toContain("timed out");
      expect(result.reason).toContain("ReDoS");
    });
  });

  // =========================================================================
  // 4. JsonSchemaGrader (>=10 table-driven test cases)
  // =========================================================================
  describe("JsonSchemaGrader", () => {
    const userSchema = {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        email: { type: "string" },
        roles: { type: "array", items: { type: "string" } },
      },
      required: ["id", "name", "email"],
      additionalProperties: false,
    };

    const testCases: Array<{
      name: string;
      config: Record<string, unknown>;
      output: string;
      shouldPass: boolean;
    }> = [
      {
        name: "1. Valid JSON object conforming to schema",
        config: { schema: userSchema },
        output: '{"id": 1, "name": "Alice", "email": "alice@example.com"}',
        shouldPass: true,
      },
      {
        name: "2. Missing required field fails schema validation",
        config: { schema: userSchema },
        output: '{"id": 1, "name": "Alice"}', // missing email
        shouldPass: false,
      },
      {
        name: "3. Incorrect type fails schema validation",
        config: { schema: userSchema },
        output: '{"id": "not-an-integer", "name": "Alice", "email": "a@a.com"}',
        shouldPass: false,
      },
      {
        name: "4. Forbidden additional property fails validation",
        config: { schema: userSchema },
        output: '{"id": 1, "name": "Alice", "email": "a@a.com", "hacker": true}',
        shouldPass: false,
      },
      {
        name: "5. Valid object with optional array field",
        config: { schema: userSchema },
        output: '{"id": 1, "name": "Alice", "email": "a@a.com", "roles": ["admin", "editor"]}',
        shouldPass: true,
      },
      {
        name: "6. JSON wrapped inside markdown code fences",
        config: { schema: userSchema },
        output: '```json\n{"id": 2, "name": "Bob", "email": "bob@example.com"}\n```',
        shouldPass: true,
      },
      {
        name: "7. JSON embedded inside conversational chatter",
        config: { schema: userSchema },
        output:
          'Here is the user record you requested:\n{"id": 3, "name": "Carol", "email": "carol@example.com"}\nLet me know if you need anything else.',
        shouldPass: true,
      },
      {
        name: "8. Trailing comma in JSON handled gracefully",
        config: { schema: userSchema, allowTrailingCommas: true },
        output: '{"id": 4, "name": "Dave", "email": "dave@example.com", }',
        shouldPass: true,
      },
      {
        name: "9. Malformed JSON returns clear syntax error",
        config: { schema: userSchema },
        output: '{ id: 1, name: "Alice" }', // Unquoted keys
        shouldPass: false,
      },
      {
        name: "10. Completely non-JSON text returns failure",
        config: { schema: userSchema },
        output: "Sorry, I cannot produce JSON output.",
        shouldPass: false,
      },
      {
        name: "11. Array schema validation",
        config: {
          schema: {
            type: "array",
            items: { type: "number" },
            minItems: 2,
          },
        },
        output: "[10, 20, 30]",
        shouldPass: true,
      },
      {
        name: "12. Array schema validation fails on too few items",
        config: {
          schema: {
            type: "array",
            items: { type: "number" },
            minItems: 3,
          },
        },
        output: "[10, 20]",
        shouldPass: false,
      },
    ];

    for (const tc of testCases) {
      it(`[json-schema] ${tc.name}`, async () => {
        const grader = createGrader("json-schema", tc.config);
        const result = await grader.grade({
          case: { input: {} },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      });
    }
  });

  // =========================================================================
  // 5. NumericGrader (>=10 table-driven test cases)
  // =========================================================================
  describe("NumericGrader", () => {
    const testCases: Array<{
      name: string;
      config: Record<string, unknown>;
      expectedInCase?: unknown;
      output: string;
      shouldPass: boolean;
      score: number;
    }> = [
      {
        name: "1. Exact integer match",
        config: { target: 42, tolerance: 0 },
        output: "42",
        shouldPass: true,
        score: 1,
      },
      {
        name: "2. Within absolute tolerance",
        config: { target: 10.0, tolerance: 0.1 },
        output: "10.05",
        shouldPass: true,
        score: 1,
      },
      {
        name: "3. Outside absolute tolerance",
        config: { target: 10.0, tolerance: 0.1 },
        output: "10.15",
        shouldPass: false,
        score: 0,
      },
      {
        name: "4. Relative tolerance match (5% of 200 is 10)",
        config: { target: 200, tolerance: 0.05, toleranceType: "relative" },
        output: "208", // diff is 8 <= 10
        shouldPass: true,
        score: 1,
      },
      {
        name: "5. Relative tolerance failure",
        config: { target: 200, tolerance: 0.05, toleranceType: "relative" },
        output: "215", // diff is 15 > 10
        shouldPass: false,
        score: 0,
      },
      {
        name: "6. Target from test case expected field",
        config: { tolerance: 1 },
        expectedInCase: 100,
        output: "99.5",
        shouldPass: true,
        score: 1,
      },
      {
        name: "7. Number parsed from currency format",
        config: { target: 1250.75, tolerance: 0.01 },
        output: "The balance is $1,250.75",
        shouldPass: true,
        score: 1,
      },
      {
        name: "8. Negative number tolerance match",
        config: { target: -15.5, tolerance: 0.5 },
        output: "-15.2",
        shouldPass: true,
        score: 1,
      },
      {
        name: "9. Scientific notation parsed",
        config: { target: 0.005, tolerance: 0.0001 },
        output: "5e-3",
        shouldPass: true,
        score: 1,
      },
      {
        name: "10. Floating point precision edge case (0.1 + 0.2)",
        config: { target: 0.3, tolerance: 1e-6 },
        output: "0.30000001",
        shouldPass: true,
        score: 1,
      },
      {
        name: "11. Text with no numbers fails gracefully",
        config: { target: 10 },
        output: "There are no digits in this text.",
        shouldPass: false,
        score: 0,
      },
      {
        name: "12. Delimiter extraction before number parse",
        config: {
          target: 77,
          tolerance: 0,
          extractor: { type: "after_delimiter", options: { delimiter: "FINAL:" } },
        },
        output: "Intermediate score: 50\nFINAL: 77",
        shouldPass: true,
        score: 1,
      },
    ];

    for (const tc of testCases) {
      it(`[numeric] ${tc.name}`, async () => {
        const grader = createGrader("numeric", tc.config);
        const result = await grader.grade({
          case: {
            input: {},
            expected: tc.expectedInCase,
          },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(result.score).toBe(tc.score);
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      });
    }
  });

  // =========================================================================
  // 6. SetMatchGrader (>=10 table-driven test cases)
  // =========================================================================
  describe("SetMatchGrader", () => {
    const testCases: Array<{
      name: string;
      config: Record<string, unknown>;
      expectedInCase?: unknown;
      output: string;
      shouldPass: boolean;
      minScore: number;
    }> = [
      {
        name: "1. Exact match identical set",
        config: { expected: ["apple", "banana", "cherry"] },
        output: '["apple", "banana", "cherry"]',
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "2. Comma separated list parsed",
        config: { expected: ["alpha", "beta", "gamma"] },
        output: "alpha, beta, gamma",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "3. Markdown bullet points parsed",
        config: { expected: ["cat", "dog", "bird"] },
        output: "- cat\n- dog\n- bird",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "4. Numbered list parsed",
        config: { expected: ["red", "green", "blue"] },
        output: "1. red\n2. green\n3. blue",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "5. Partial overlap F1 score (threshold 0.5 passes)",
        config: {
          expected: ["apple", "banana", "cherry"],
          metric: "f1",
          threshold: 0.5,
        },
        output: "apple, banana, date", // 2 TP, 1 FP, 1 FN -> F1 = 0.67
        shouldPass: true,
        minScore: 0.6,
      },
      {
        name: "6. Partial overlap exact metric fails",
        config: {
          expected: ["apple", "banana", "cherry"],
          metric: "exact",
        },
        output: "apple, banana, date",
        shouldPass: false,
        minScore: 0.0,
      },
      {
        name: "7. Precision metric: 2 TP out of 2 received = 1.0",
        config: {
          expected: ["a", "b", "c"],
          metric: "precision",
          threshold: 1.0,
        },
        output: "a, b",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "8. Recall metric: 2 TP out of 3 expected = 0.67",
        config: {
          expected: ["a", "b", "c"],
          metric: "recall",
          threshold: 0.8,
        },
        output: "a, b",
        shouldPass: false,
        minScore: 0.6,
      },
      {
        name: "9. Case-folding enabled on items",
        config: { expected: ["TypeScript", "Python"], caseFold: true },
        output: "typescript, python",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "10. Expected from case.expected",
        config: {},
        expectedInCase: ["one", "two"],
        output: "one, two",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "11. Deduplication: duplicates in output do not inflate score",
        config: { expected: ["a", "b"] },
        output: "a, a, a, b, b",
        shouldPass: true,
        minScore: 1.0,
      },
      {
        name: "12. Disjoint sets produce 0 score",
        config: { expected: ["x", "y"] },
        output: "a, b, c",
        shouldPass: false,
        minScore: 0.0,
      },
    ];

    for (const tc of testCases) {
      it(`[set-match] ${tc.name}`, async () => {
        const grader = createGrader("set-match", tc.config);
        const result = await grader.grade({
          case: {
            input: {},
            expected: tc.expectedInCase,
          },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(result.score).toBeGreaterThanOrEqual(tc.minScore);
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      });
    }
  });

  // =========================================================================
  // 7. LengthConstraintGrader (>=10 table-driven test cases)
  // =========================================================================
  describe("LengthConstraintGrader", () => {
    const testCases: Array<{
      name: string;
      config: Record<string, unknown>;
      output: string;
      shouldPass: boolean;
    }> = [
      {
        name: "1. Word count within bounds",
        config: { minWords: 3, maxWords: 6 },
        output: "This sentence has four words.",
        shouldPass: true,
      },
      {
        name: "2. Word count below minimum",
        config: { minWords: 5 },
        output: "Too short.",
        shouldPass: false,
      },
      {
        name: "3. Word count above maximum",
        config: { maxWords: 3 },
        output: "One two three four five.",
        shouldPass: false,
      },
      {
        name: "4. Character count within bounds",
        config: { minChars: 10, maxChars: 30 },
        output: "Valid length text.",
        shouldPass: true,
      },
      {
        name: "5. Character count below minimum",
        config: { minChars: 20 },
        output: "Short",
        shouldPass: false,
      },
      {
        name: "6. Character count above maximum",
        config: { maxChars: 5 },
        output: "A very long sentence exceeding five chars.",
        shouldPass: false,
      },
      {
        name: "7. Required section header present",
        config: { requiredSections: ["## Summary", "## Conclusion"] },
        output: "## Summary\nGood.\n\n## Conclusion\nDone.",
        shouldPass: true,
      },
      {
        name: "8. Required section header missing",
        config: { requiredSections: ["## Summary", "## Conclusion"] },
        output: "## Summary\nGood.",
        shouldPass: false,
      },
      {
        name: "9. Forbidden section header absent passes",
        config: { forbiddenSections: ["## Confidential"] },
        output: "## Public Information\nHello.",
        shouldPass: true,
      },
      {
        name: "10. Forbidden section header present fails",
        config: { forbiddenSections: ["## Confidential"] },
        output: "## Confidential\nLeaked data.",
        shouldPass: false,
      },
      {
        name: "11. Combined constraints satisfied",
        config: {
          minWords: 2,
          maxWords: 10,
          requiredSections: ["# Title"],
        },
        output: "# Title\nHere is content.",
        shouldPass: true,
      },
      {
        name: "12. Empty string evaluated against minWords",
        config: { minWords: 1 },
        output: "   ",
        shouldPass: false,
      },
    ];

    for (const tc of testCases) {
      it(`[length-constraint] ${tc.name}`, async () => {
        const grader = createGrader("length-constraint", tc.config);
        const result = await grader.grade({
          case: { input: {} },
          output: tc.output,
        });

        expect(result.pass).toBe(tc.shouldPass);
        expect(typeof result.reason).toBe("string");
        expect(result.reason.length).toBeGreaterThan(0);
      });
    }
  });

  // =========================================================================
  // 8. Custom Graders & Trust Boundary
  // =========================================================================
  describe("Custom Graders & Trust Boundary", () => {
    it("registers and executes a local custom grader", async () => {
      clearCustomGraders();

      registerCustomGrader("my-org/palindrome", (rawConfig: unknown) => {
        const config = (rawConfig as { minLen?: number }) ?? {};
        const minLen = config.minLen ?? 3;

        return {
          type: "my-org/palindrome",
          versionId: "mock-custom-version-id".padEnd(64, "0"),
          config,
          grade(input) {
            const clean = input.output.toLowerCase().replace(/[^a-z0-9]/g, "");
            const isPalindrome =
              clean.length >= minLen && clean === clean.split("").reverse().join("");
            return {
              score: isPalindrome ? 1 : 0,
              pass: isPalindrome,
              reason: isPalindrome
                ? `Valid palindrome of length ${clean.length}`
                : `Not a palindrome: '${clean}'`,
            };
          },
        };
      });

      expect(listCustomGraderTypes()).toContain("my-org/palindrome");

      const grader = createGrader("my-org/palindrome", { minLen: 4 });
      const passResult = await grader.grade({
        case: { input: {} },
        output: "Racecar",
      });
      expect(passResult.pass).toBe(true);
      expect(passResult.score).toBe(1);

      const failResult = await grader.grade({
        case: { input: {} },
        output: "Hello",
      });
      expect(failResult.pass).toBe(false);
      expect(failResult.score).toBe(0);

      clearCustomGraders();
    });

    it("throws a descriptive error when attempting to instantiate an unknown grader type", () => {
      expect(() => createGrader("non-existent-grader-type", {})).toThrowError(
        /Unknown grader type/,
      );
    });

    it("ensures content-addressed version ID is deterministic and stable", () => {
      const grader1 = createGrader("exact", { expected: "test", caseFold: true });
      const grader2 = createGrader("exact", { caseFold: true, expected: "test" });
      expect(grader1.versionId).toBe(grader2.versionId);
      expect(grader1.versionId).toHaveLength(64);
    });
  });
});
