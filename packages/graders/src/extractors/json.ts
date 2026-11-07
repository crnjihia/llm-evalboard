import { stripCodeFences } from "./code-fences.js";

/**
 * Extracts a JSON substring (object `{ ... }` or array `[ ... ]`) from mixed text.
 */
export function extractJsonString(text: string): string {
  const stripped = stripCodeFences(text);

  // If already directly valid JSON, return stripped
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // Proceed to scan for balanced object or array
  }

  // Find first { or [
  const firstBrace = stripped.indexOf("{");
  const firstBracket = stripped.indexOf("[");

  let startIndex = -1;
  let openChar = "{";
  let closeChar = "}";

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
    openChar = "{";
    closeChar = "}";
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
    openChar = "[";
    closeChar = "]";
  }

  if (startIndex === -1) {
    return stripped;
  }

  // Scan forward with brace balancing, taking string literals into account
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let endIndex = -1;

  for (let i = startIndex; i < stripped.length; i++) {
    const ch = stripped[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (ch === "\\") {
      escapeNext = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (ch === openChar) {
        depth++;
      } else if (ch === closeChar) {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex !== -1) {
    const candidate = stripped.slice(startIndex, endIndex + 1).trim();
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      return candidate;
    }
  }

  return stripped;
}
