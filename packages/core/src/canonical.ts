import { createHash } from "node:crypto";

/**
 * Normalises an arbitrary value for canonical serialization:
 * - Object keys are recursively sorted alphabetically
 * - Strings are normalised to Unicode NFC
 * - Arrays preserve element order with normalised elements
 * - Dates are converted to ISO strings
 * - undefined properties in objects are omitted
 */
export function normaliseForCanonicalJson(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.normalize("NFC");
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Cannot canonically serialise non-finite number: ${value}`);
    }
    // Normalise -0 to 0
    return Object.is(value, -0) ? 0 : value;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normaliseForCanonicalJson(item));
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const result: Record<string, unknown> = {};

    for (const key of sortedKeys) {
      const val = obj[key];
      if (val !== undefined && typeof val !== "function" && typeof val !== "symbol") {
        result[key.normalize("NFC")] = normaliseForCanonicalJson(val);
      }
    }
    return result;
  }

  throw new Error(`Unsupported type for canonical serialization: ${typeof value}`);
}

/**
 * Produces deterministic, canonical JSON with sorted keys and compact formatting.
 */
export function canonicalJson(value: unknown): string {
  const normalised = normaliseForCanonicalJson(value);
  return JSON.stringify(normalised);
}

/**
 * Computes sha256 hash of a string in lowercase hex.
 */
export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Computes sha256 hash of canonical JSON representation of any object.
 */
export function hashCanonical(value: unknown): string {
  return sha256(canonicalJson(value));
}
