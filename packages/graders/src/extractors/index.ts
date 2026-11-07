import { z } from "zod";
import type { ExtractorConfig } from "../types.js";
import { stripCodeFences } from "./code-fences.js";
import { extractAfterDelimiter } from "./delimiter.js";
import { extractJsonString } from "./json.js";
import { extractRegexCapture } from "./regex.js";

export * from "./code-fences.js";
export * from "./delimiter.js";
export * from "./json.js";
export * from "./regex.js";

export const extractorConfigSchema = z.object({
  type: z.enum(["strip_code_fences", "extract_json", "after_delimiter", "regex_capture"]),
  options: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Runs the specified extractor on input text.
 */
export function applyExtractor(text: string, config?: ExtractorConfig | null): string {
  if (!config) {
    return text;
  }

  const options = config.options ?? {};

  switch (config.type) {
    case "strip_code_fences":
      return stripCodeFences(text);

    case "extract_json":
      return extractJsonString(text);

    case "after_delimiter": {
      const delimiter = typeof options.delimiter === "string" ? options.delimiter : "";
      const caseSensitive = options.caseSensitive !== false;
      const fallbackToWhole = options.fallbackToWhole !== false;
      return extractAfterDelimiter(text, { delimiter, caseSensitive, fallbackToWhole });
    }

    case "regex_capture": {
      const pattern = typeof options.pattern === "string" ? options.pattern : "(.*)";
      const flags = typeof options.flags === "string" ? options.flags : "";
      const groupIndex = typeof options.groupIndex === "number" ? options.groupIndex : 1;
      const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 100;
      return extractRegexCapture(text, { pattern, flags, groupIndex, timeoutMs });
    }

    default:
      return text;
  }
}
