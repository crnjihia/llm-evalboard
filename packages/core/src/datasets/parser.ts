import type { z } from "zod";
import { hashCaseContent, hashDatasetVersion } from "../hashing.js";

export interface ParsedCase {
  id: string;
  caseIndex: number;
  input: Record<string, unknown>;
  expected?: unknown;
  metadata?: Record<string, unknown>;
  tags: string[];
  split: string;
}

export interface ParsedDataset {
  versionId: string;
  cases: ParsedCase[];
  splits: Record<string, number>;
  totalCases: number;
}

export interface ParseDatasetOptions {
  inputSchema?: z.ZodTypeAny;
  defaultSplit?: string;
}

export class DatasetParseError extends Error {
  constructor(
    message: string,
    public readonly lineOrIndex?: number,
  ) {
    super(message);
    this.name = "DatasetParseError";
  }
}

/**
 * Robust CSV line tokenizer respecting quotes and commas.
 */
export function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < csvContent.length; i++) {
    const char = csvContent[i];
    const nextChar = csvContent[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        currentRow.push(currentField);
        currentField = "";
      } else if (char === "\r") {
        // ignore carriage return
      } else if (char === "\n") {
        currentRow.push(currentField);
        if (currentRow.some((f) => f.trim().length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = "";
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some((f) => f.trim().length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Normalises raw object into a structured case.
 */
export function normalizeRawCase(
  raw: Record<string, unknown>,
  index: number,
  options: ParseDatasetOptions = {},
): ParsedCase {
  let input: Record<string, unknown>;

  if (raw.input && typeof raw.input === "object" && !Array.isArray(raw.input)) {
    input = raw.input as Record<string, unknown>;
  } else if (typeof raw.input === "string") {
    try {
      input = JSON.parse(raw.input);
    } catch {
      input = { query: raw.input };
    }
  } else {
    // Collect all fields other than expected, tags, split, metadata, id into input
    const { expected, tags, split, metadata, id, ...rest } = raw;
    input = Object.keys(rest).length > 0 ? rest : { query: "" };
  }

  // Validate against input schema if provided
  if (options.inputSchema) {
    const schemaResult = options.inputSchema.safeParse(input);
    if (!schemaResult.success) {
      throw new DatasetParseError(
        `Case at index ${index} failed input schema validation: ${schemaResult.error.message}`,
        index,
      );
    }
  }

  // Parse tags
  let tags: string[] = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof raw.tags === "string") {
    tags = raw.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const split =
    typeof raw.split === "string" && raw.split.trim()
      ? raw.split.trim()
      : (options.defaultSplit ?? "test");
  const expected = raw.expected !== undefined ? raw.expected : undefined;
  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : undefined;

  const caseId = hashCaseContent({
    input,
    expected,
    metadata,
    tags,
  });

  return {
    id: caseId,
    caseIndex: index,
    input,
    expected,
    metadata,
    tags,
    split,
  };
}

/**
 * Parses JSONL formatted dataset.
 */
export function parseJsonlDataset(
  content: string,
  options: ParseDatasetOptions = {},
): ParsedCase[] {
  const lines = content.split("\n");
  const cases: ParsedCase[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    try {
      const parsed = JSON.parse(line);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Line must be a JSON object");
      }
      cases.push(normalizeRawCase(parsed as Record<string, unknown>, cases.length, options));
    } catch (err) {
      throw new DatasetParseError(
        `Invalid JSON at line ${i + 1}: ${err instanceof Error ? err.message : String(err)}`,
        i + 1,
      );
    }
  }

  return cases;
}

/**
 * Parses JSON formatted dataset (array or { cases: [...] }).
 */
export function parseJsonDataset(content: string, options: ParseDatasetOptions = {}): ParsedCase[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new DatasetParseError(
      `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let rawList: unknown[];
  if (Array.isArray(parsed)) {
    rawList = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "cases" in parsed &&
    Array.isArray((parsed as { cases: unknown[] }).cases)
  ) {
    rawList = (parsed as { cases: unknown[] }).cases;
  } else {
    throw new DatasetParseError(
      "JSON dataset must be an array of cases or an object with a 'cases' array",
    );
  }

  return rawList.map((item, index) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new DatasetParseError(`Case at index ${index} must be a JSON object`, index);
    }
    return normalizeRawCase(item as Record<string, unknown>, index, options);
  });
}

/**
 * Parses CSV formatted dataset.
 */
export function parseCsvDataset(content: string, options: ParseDatasetOptions = {}): ParsedCase[] {
  const rows = parseCsvRows(content);
  if (rows.length < 2) {
    throw new DatasetParseError("CSV dataset must contain at least a header row and one data row");
  }

  const headers = rows[0]?.map((h) => h.trim());
  if (!headers || headers.length === 0) {
    throw new DatasetParseError("CSV dataset missing header row");
  }

  const cases: ParsedCase[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    const rawObj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const header = headers[c];
      if (header) {
        rawObj[header] = row[c] ?? "";
      }
    }

    cases.push(normalizeRawCase(rawObj, cases.length, options));
  }

  return cases;
}

/**
 * Detects format and parses dataset string (JSONL, CSV, or JSON).
 */
export function parseDataset(content: string, options: ParseDatasetOptions = {}): ParsedDataset {
  const trimmed = content.trim();
  let cases: ParsedCase[];

  if (trimmed.startsWith("[") || (trimmed.startsWith("{") && trimmed.includes('"cases"'))) {
    cases = parseJsonDataset(trimmed, options);
  } else if (trimmed.startsWith("{") || trimmed.includes("\n{")) {
    cases = parseJsonlDataset(trimmed, options);
  } else {
    // Assume CSV
    cases = parseCsvDataset(trimmed, options);
  }

  const caseHashes = cases.map((c) => c.id);
  const versionId = hashDatasetVersion(caseHashes);

  const splits: Record<string, number> = {};
  for (const c of cases) {
    splits[c.split] = (splits[c.split] ?? 0) + 1;
  }

  return {
    versionId,
    cases,
    splits,
    totalCases: cases.length,
  };
}

/**
 * Warns if tuning and reporting splits overlap.
 */
export function checkSplitDiscipline(
  tuningSplit: string,
  reportingSplit: string,
): { safe: boolean; warning?: string } {
  if (tuningSplit.toLowerCase() === reportingSplit.toLowerCase()) {
    return {
      safe: false,
      warning: `Split contamination warning: tuning split ('${tuningSplit}') is identical to reporting split ('${reportingSplit}'). Evaluation results on the same split will suffer from optimism bias.`,
    };
  }
  return { safe: true };
}
