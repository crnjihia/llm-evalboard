import type { SyntheticVariation } from "./types.js";

/**
 * Deterministic seeded 32-bit PRNG (Mulberry32)
 */
export function createPrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_DICTIONARY = [
  "Alice",
  "Bob",
  "Charlie",
  "Dana",
  "Elena",
  "Farooq",
  "Grace",
  "Hassan",
  "Isabella",
  "Javier",
  "Kavita",
  "Liam",
  "Mei",
  "Noah",
  "Olivia",
  "Priya",
];

const LOCATION_DICTIONARY = [
  "New York",
  "London",
  "Nairobi",
  "Tokyo",
  "Berlin",
  "Toronto",
  "Singapore",
  "Sydney",
  "San Francisco",
  "São Paulo",
  "Mumbai",
  "Amsterdam",
];

const PREFIX_PROMPTS = [
  "Briefly: ",
  "Please answer concisely: ",
  "In detail: ",
  "Step-by-step: ",
  "As an expert: ",
  "Note: ",
];

export function substituteEntities(text: string, rng: () => number): string {
  let result = text;

  // Substitute Name
  for (const name of NAME_DICTIONARY) {
    const regex = new RegExp(`\\b${name}\\b`, "g");
    if (regex.test(result)) {
      const remainingNames = NAME_DICTIONARY.filter((n) => n !== name);
      const randomIdx = Math.floor(rng() * remainingNames.length);
      const replacement = remainingNames[randomIdx] ?? "Alex";
      result = result.replace(regex, replacement);
      break;
    }
  }

  // Substitute Location
  for (const loc of LOCATION_DICTIONARY) {
    const regex = new RegExp(`\\b${loc}\\b`, "g");
    if (regex.test(result)) {
      const remainingLocs = LOCATION_DICTIONARY.filter((l) => l !== loc);
      const randomIdx = Math.floor(rng() * remainingLocs.length);
      const replacement = remainingLocs[randomIdx] ?? "Paris";
      result = result.replace(regex, replacement);
      break;
    }
  }

  // Substitute 4-digit years (e.g. 2020-2029)
  result = result.replace(/\b202[0-9]\b/g, () => {
    const newYear = 2020 + Math.floor(rng() * 9);
    return newYear.toString();
  });

  return result;
}

export function injectMinorTypo(text: string, rng: () => number): string {
  if (text.length < 5) return text;
  const words = text.split(" ");
  if (words.length === 0) return text;

  const targetWordIdx = Math.floor(rng() * words.length);
  const targetWord = words[targetWordIdx];
  if (!targetWord || targetWord.length < 4) return text;

  // Swap two adjacent letters in the middle of target word
  const charIdx = 1 + Math.floor(rng() * (targetWord.length - 2));
  const chars = targetWord.split("");
  const temp = chars[charIdx];
  const nextChar = chars[charIdx + 1];
  if (temp && nextChar) {
    chars[charIdx] = nextChar;
    chars[charIdx + 1] = temp;
    words[targetWordIdx] = chars.join("");
  }

  return words.join(" ");
}

export function perturbPromptStyle(text: string, rng: () => number): string {
  const choice = Math.floor(rng() * 3);
  switch (choice) {
    case 0: {
      // Add a directive prefix
      const prefix = PREFIX_PROMPTS[Math.floor(rng() * PREFIX_PROMPTS.length)] ?? "Please: ";
      return `${prefix}${text}`;
    }
    case 1: {
      // Lowercase first letter and remove trailing period
      const trimmed = text.trim();
      const firstLower = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
      return firstLower.endsWith(".") ? firstLower.slice(0, -1) : firstLower;
    }
    default: {
      // Add a trailing question mark or punctuation emphasis
      const trimmed = text.trim();
      return trimmed.endsWith("?") ? `${trimmed}` : `${trimmed}?`;
    }
  }
}

/**
 * Generate synthetic perturbations of input data
 */
export function generateSyntheticVariations(
  baseInput: Record<string, unknown>,
  count = 3,
  seed = 42,
): SyntheticVariation[] {
  const variations: SyntheticVariation[] = [];
  const rng = createPrng(seed);

  // Identify string keys to perturb (prompt/query keys or strings longer than 20 chars)
  const PROMPT_KEY_NAMES = new Set([
    "query",
    "prompt",
    "input",
    "question",
    "message",
    "text",
    "content",
  ]);

  const stringKeys = Object.keys(baseInput).filter((k) => {
    const val = baseInput[k];
    if (typeof val !== "string") return false;
    return PROMPT_KEY_NAMES.has(k.toLowerCase()) || val.length > 20;
  });

  for (let i = 0; i < count; i++) {
    const perturbedInput = JSON.parse(JSON.stringify(baseInput)) as Record<string, unknown>;
    const perturbationMethod = i % 3;
    let perturbationType = "entity_substitution";

    for (const key of stringKeys) {
      const originalVal = baseInput[key] as string;
      let modifiedVal = originalVal;

      if (perturbationMethod === 0) {
        perturbationType = "entity_substitution";
        modifiedVal = substituteEntities(originalVal, rng);
      } else if (perturbationMethod === 1) {
        perturbationType = "prompt_style";
        modifiedVal = perturbPromptStyle(originalVal, rng);
      } else {
        perturbationType = "typo_injection";
        modifiedVal = injectMinorTypo(originalVal, rng);
      }

      perturbedInput[key] = modifiedVal;
    }

    variations.push({
      variationIndex: i + 1,
      perturbationType,
      input: perturbedInput,
    });
  }

  return variations;
}
