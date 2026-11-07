import type { Grader } from "./types.js";

/**
 * ======================================================================================
 * SECURITY & TRUST BOUNDARY NOTICE
 * ======================================================================================
 * Custom graders execute arbitrary TypeScript/JavaScript code within the active Node.js
 * process environment with process-level permissions (filesystem, environment variables).
 *
 * TRUST BOUNDARY RULES:
 * 1. Custom graders MUST ONLY be registered from trusted code modules located directly
 *    in the user's repository, local project, or controlled CI/CD pipelines.
 * 2. Custom graders MUST NEVER be loaded dynamically from untrusted network payloads,
 *    unauthenticated webhooks, database fields submitted via shared web UIs, or
 *    arbitrary user inputs.
 * 3. The web dashboard and shared server components MUST NOT allow remote users to submit
 *    executable code strings as graders.
 * ======================================================================================
 */

export type CustomGraderFactory = (config: unknown) => Grader;

const customGraderRegistry = new Map<string, CustomGraderFactory>();

/**
 * Registers a custom grader type.
 * Intended for use in repository-local test suites, scripts, and CI workflows.
 *
 * @param type Unique type name for the grader (e.g. "my-project/semantic-similarity")
 * @param factory Factory function returning a Grader instance given a config object
 */
export function registerCustomGrader(type: string, factory: CustomGraderFactory): void {
  if (customGraderRegistry.has(type)) {
    console.warn(`[CustomGrader] Overwriting previously registered grader type: '${type}'`);
  }
  customGraderRegistry.set(type, factory);
}

/**
 * Retrieves a custom grader factory if registered.
 */
export function getCustomGrader(type: string): CustomGraderFactory | undefined {
  return customGraderRegistry.get(type);
}

/**
 * Returns all registered custom grader types.
 */
export function listCustomGraderTypes(): string[] {
  return Array.from(customGraderRegistry.keys());
}

/**
 * Clears the custom grader registry (useful for test isolation).
 */
export function clearCustomGraders(): void {
  customGraderRegistry.clear();
}
