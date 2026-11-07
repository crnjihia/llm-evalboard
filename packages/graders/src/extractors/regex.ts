import vm from "node:vm";

export interface RegexCaptureOptions {
  pattern: string;
  flags?: string;
  groupIndex?: number;
  timeoutMs?: number;
}

/**
 * Extracts a regular expression capture group with a deadline timeout to guard against ReDoS.
 */
export function extractRegexCapture(text: string, options: RegexCaptureOptions): string {
  const { pattern, flags = "", groupIndex = 1, timeoutMs = 100 } = options;

  try {
    const code = `
      const rx = new RegExp(pattern, flags);
      const m = rx.exec(text);
      m ? m[groupIndex] ?? "" : "";
    `;

    const result = vm.runInNewContext(
      code,
      { pattern, flags, text, groupIndex },
      { timeout: timeoutMs },
    );

    return typeof result === "string" ? result : "";
  } catch {
    // If execution timed out or threw, return empty
    return "";
  }
}
