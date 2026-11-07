export interface AfterDelimiterOptions {
  delimiter: string;
  caseSensitive?: boolean;
  fallbackToWhole?: boolean;
}

/**
 * Extracts text occurring after a specific delimiter.
 */
export function extractAfterDelimiter(text: string, options: AfterDelimiterOptions): string {
  const { delimiter, caseSensitive = true, fallbackToWhole = true } = options;

  if (!delimiter) {
    return text.trim();
  }

  const targetText = caseSensitive ? text : text.toLowerCase();
  const targetDelim = caseSensitive ? delimiter : delimiter.toLowerCase();

  const idx = targetText.lastIndexOf(targetDelim);
  if (idx !== -1) {
    return text.slice(idx + delimiter.length).trim();
  }

  return fallbackToWhole ? text.trim() : "";
}
