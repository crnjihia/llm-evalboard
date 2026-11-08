export type MappingWarningCode =
  | "PF_WARN_CODE_EXECUTION"
  | "PF_WARN_WEBHOOK"
  | "PF_WARN_COMPLEX_PROVIDER"
  | "PF_WARN_UNSUPPORTED_ASSERTION"
  | "PF_WARN_FILE_RESOLUTION"
  | "PF_WARN_MODERATION";

export interface MappingWarning {
  code: MappingWarningCode;
  message: string;
  severity: "warning" | "error" | "info";
  assertionType?: string;
  caseIndex?: number;
  remediation: string;
}

export function createCodeExecutionWarning(type: string, caseIndex?: number): MappingWarning {
  return {
    code: "PF_WARN_CODE_EXECUTION",
    message: `Assertion type '${type}' involves arbitrary host code execution which is not supported inside content-addressed deterministic sandboxes.`,
    severity: "warning",
    assertionType: type,
    caseIndex,
    remediation:
      "Replace script assertions with deterministic regex, json-schema, or llm-rubric graders.",
  };
}

export function createWebhookWarning(caseIndex?: number): MappingWarning {
  return {
    code: "PF_WARN_WEBHOOK",
    message:
      "Assertion type 'webhook' requires outbound network requests during grading, which violates offline determinism.",
    severity: "warning",
    assertionType: "webhook",
    caseIndex,
    remediation:
      "Mock the external check using regex or exact graders, or run assertions as part of a pre/post-evaluation step.",
  };
}

export function createUnsupportedAssertionWarning(
  type: string,
  caseIndex?: number,
): MappingWarning {
  return {
    code: "PF_WARN_UNSUPPORTED_ASSERTION",
    message: `Promptfoo assertion type '${type}' does not have a direct built-in deterministic mapping.`,
    severity: "warning",
    assertionType: type,
    caseIndex,
    remediation:
      "Review the assertion in promptfoo-mapping.md and consider mapping to an exact, contains, or llm-rubric grader.",
  };
}

export function createComplexProviderWarning(providerId: string): MappingWarning {
  return {
    code: "PF_WARN_COMPLEX_PROVIDER",
    message: `Provider '${providerId}' specifies custom plugin options that may not be supported directly by standard providers.`,
    severity: "info",
    remediation:
      "Ensure model names follow standard provider conventions: 'openai:gpt-4o', 'anthropic:claude-3-5-sonnet', 'ollama:...', 'mock:...'.",
  };
}
