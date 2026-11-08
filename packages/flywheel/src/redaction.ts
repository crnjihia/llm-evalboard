import type { ObjectRedactionResult, RedactionResult, RedactionRule } from "./types.js";

// RFC-compliant email pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// US Social Security Number: XXX-XX-XXXX or XXX XX XXXX
const SSN_REGEX = /\b(?!000|666|9\d{2})\d{3}[- ](?!00)\d{2}[- ](?!0000)\d{4}\b/g;

// Phone numbers: international + E.164 and US formatted
const PHONE_REGEX =
  /(?:\+?(\d{1,3}))?[-. ]?\(?(\d{3})\)?[-. ]?(\d{3})[-. ]?(\d{4})(?:\s*(?:ext|x|ext.)\s*(\d{1,5}))?\b/g;

// API Tokens & Secrets
const OPENAI_KEY_REGEX = /\bsk-[a-zA-Z0-9_-]{20,}\b/g;
const JWT_REGEX = /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;
const GITHUB_KEY_REGEX = /\bgh[pousr]-[a-zA-Z0-9]{36}\b/g;
const BEARER_TOKEN_REGEX = /\bBearer\s+[a-zA-Z0-9_\-\.]{20,}\b/gi;

// IPv4 and IPv6
const IPV4_REGEX =
  /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
const IPV6_REGEX = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g;

// Candidate credit card pattern (13-19 digits ending with a digit, with optional spaces or dashes)
const CREDIT_CARD_CANDIDATE_REGEX = /\b(?:\d[ -]?){12,18}\d\b/g;

export function passesLuhn(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let shouldDouble = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    const char = digits.charAt(i);
    let digit = Number.parseInt(char, 10);
    if (Number.isNaN(digit)) return false;

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

export function scrubText(text: string, customRules: RedactionRule[] = []): RedactionResult {
  let scrubbed = text;
  let redactedCount = 0;
  const detectedTypes = new Set<string>();

  // 1. API Keys & Secrets
  if (OPENAI_KEY_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(OPENAI_KEY_REGEX, () => {
      redactedCount++;
      detectedTypes.add("API_KEY");
      return "[API_KEY]";
    });
  }
  if (JWT_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(JWT_REGEX, () => {
      redactedCount++;
      detectedTypes.add("API_KEY");
      return "[API_KEY]";
    });
  }
  if (GITHUB_KEY_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(GITHUB_KEY_REGEX, () => {
      redactedCount++;
      detectedTypes.add("API_KEY");
      return "[API_KEY]";
    });
  }
  if (BEARER_TOKEN_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(BEARER_TOKEN_REGEX, () => {
      redactedCount++;
      detectedTypes.add("API_KEY");
      return "Bearer [API_KEY]";
    });
  }

  // 2. Email Addresses
  if (EMAIL_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(EMAIL_REGEX, () => {
      redactedCount++;
      detectedTypes.add("EMAIL");
      return "[EMAIL]";
    });
  }

  // 3. Social Security Numbers
  if (SSN_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(SSN_REGEX, () => {
      redactedCount++;
      detectedTypes.add("SSN");
      return "[SSN]";
    });
  }

  // 4. Credit Cards with Luhn Check
  scrubbed = scrubbed.replace(CREDIT_CARD_CANDIDATE_REGEX, (match) => {
    if (passesLuhn(match)) {
      redactedCount++;
      detectedTypes.add("CREDIT_CARD");
      return "[CREDIT_CARD]";
    }
    return match;
  });

  // 5. Phone Numbers
  if (PHONE_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(PHONE_REGEX, () => {
      redactedCount++;
      detectedTypes.add("PHONE");
      return "[PHONE]";
    });
  }

  // 6. IP Addresses
  if (IPV4_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(IPV4_REGEX, () => {
      redactedCount++;
      detectedTypes.add("IP_ADDRESS");
      return "[IP_ADDRESS]";
    });
  }
  if (IPV6_REGEX.test(scrubbed)) {
    scrubbed = scrubbed.replace(IPV6_REGEX, () => {
      redactedCount++;
      detectedTypes.add("IP_ADDRESS");
      return "[IP_ADDRESS]";
    });
  }

  // 7. Custom Rules
  for (const rule of customRules) {
    if (rule.pattern.test(scrubbed)) {
      scrubbed = scrubbed.replace(rule.pattern, (match) => {
        redactedCount++;
        detectedTypes.add(rule.name);
        return typeof rule.replacement === "function" ? rule.replacement(match) : rule.replacement;
      });
    }
  }

  return {
    text: scrubbed,
    redactedCount,
    detectedTypes: Array.from(detectedTypes),
  };
}

export function scrubObject<T>(
  obj: T,
  customRules: RedactionRule[] = [],
): ObjectRedactionResult<T> {
  let totalRedactions = 0;
  const detectedTypes = new Set<string>();

  function traverse(value: unknown): unknown {
    if (typeof value === "string") {
      const res = scrubText(value, customRules);
      totalRedactions += res.redactedCount;
      for (const t of res.detectedTypes) detectedTypes.add(t);
      return res.text;
    }
    if (Array.isArray(value)) {
      return value.map(traverse);
    }
    if (value !== null && typeof value === "object") {
      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        copy[k] = traverse(v);
      }
      return copy;
    }
    return value;
  }

  const redacted = traverse(obj) as T;

  return {
    redacted,
    totalRedactions,
    detectedTypes: Array.from(detectedTypes),
  };
}
