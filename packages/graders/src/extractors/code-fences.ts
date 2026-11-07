/**
 * Strips Markdown code fences (e.g. ```json ... ``` or ``` ... ```) from text.
 * If code fences are present, returns the inner content trimmed.
 * Otherwise returns the input trimmed.
 */
export function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  // Match ```lang ... ``` or ``` ... ```
  const fenceRegex = /^```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```$/;
  const match = trimmed.match(fenceRegex);
  if (match?.[1] !== undefined) {
    return match[1].trim();
  }

  // Handle case where code fence is embedded in surrounding commentary
  const embeddedFence = /```(?:[a-zA-Z0-9_-]+)?\s*([\s\S]*?)\s*```/;
  const embeddedMatch = trimmed.match(embeddedFence);
  if (embeddedMatch?.[1] !== undefined) {
    return embeddedMatch[1].trim();
  }

  return trimmed;
}
