import { parse as parseYaml } from "yaml";

export interface FewShotExample {
  user: string;
  assistant: string;
}

export interface PromptFrontMatter {
  name?: string;
  description?: string;
  variables?: Record<string, string>;
  few_shot?: FewShotExample[];
  [key: string]: unknown;
}

export interface ParsedPromptFile {
  frontMatter: PromptFrontMatter;
  template: string;
  name?: string;
  description?: string;
  fewShot?: FewShotExample[];
}

export class PromptInterpolationError extends Error {
  constructor(
    message: string,
    public readonly variableName?: string,
  ) {
    super(message);
    this.name = "PromptInterpolationError";
  }
}

/**
 * Parses a prompt file containing optional YAML front matter.
 */
export function parsePromptFile(fileContent: string): ParsedPromptFile {
  const trimmed = fileContent.trim();
  if (!trimmed.startsWith("---")) {
    return {
      frontMatter: {},
      template: fileContent,
    };
  }

  const endOfFrontMatter = trimmed.indexOf("---", 3);
  if (endOfFrontMatter === -1) {
    return {
      frontMatter: {},
      template: fileContent,
    };
  }

  const yamlRaw = trimmed.slice(3, endOfFrontMatter).trim();
  const templateRaw = trimmed.slice(endOfFrontMatter + 3).trim();

  let frontMatter: PromptFrontMatter = {};
  if (yamlRaw) {
    try {
      frontMatter = parseYaml(yamlRaw) as PromptFrontMatter;
    } catch (err) {
      throw new Error(
        `Invalid YAML front matter: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    frontMatter,
    template: templateRaw,
    name: frontMatter.name,
    description: frontMatter.description,
    fewShot: frontMatter.few_shot,
  };
}

/**
 * Extracts all unique {{variable}} names declared in a template string.
 */
export function extractTemplateVariables(template: string): string[] {
  const regex = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
  const variables = new Set<string>();
  let match: RegExpExecArray | null;

  while (true) {
    match = regex.exec(template);
    if (!match) break;
    if (match[1]) {
      variables.add(match[1]);
    }
  }

  return Array.from(variables);
}

export interface RenderPromptOptions {
  strict?: boolean; // default true
  fewShot?: FewShotExample[];
}

/**
 * Renders a single string prompt template by interpolating variables.
 * Under strict mode (default), missing or extraneous variables throw PromptInterpolationError.
 */
export function renderTemplateString(
  template: string,
  variables: Record<string, unknown> = {},
  options: RenderPromptOptions = {},
): string {
  const strict = options.strict ?? true;
  const requiredVars = extractTemplateVariables(template);
  const providedKeys = Object.keys(variables);

  if (strict) {
    // Check for missing variables
    for (const required of requiredVars) {
      if (variables[required] === undefined || variables[required] === null) {
        throw new PromptInterpolationError(
          `Missing variable in prompt interpolation: '{{${required}}}'`,
          required,
        );
      }
    }

    // Check for extra/extraneous variables
    for (const provided of providedKeys) {
      if (!requiredVars.includes(provided)) {
        throw new PromptInterpolationError(
          `Extraneous variable provided not present in template: '${provided}'`,
          provided,
        );
      }
    }
  }

  let rendered = template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, varName: string) => {
    const val = variables[varName];
    if (val === undefined || val === null) {
      return strict ? "" : `{{${varName}}}`;
    }
    if (typeof val === "object") {
      return JSON.stringify(val);
    }
    return String(val);
  });

  // Prepend few-shot examples if present
  if (options.fewShot && options.fewShot.length > 0) {
    const formattedExamples = options.fewShot
      .map((ex, i) => `[Example ${i + 1}]\nUser: ${ex.user}\nAssistant: ${ex.assistant}`)
      .join("\n\n");
    rendered = `${formattedExamples}\n\n[Current Task]\n${rendered}`;
  }

  return rendered;
}

export interface ChatMessageTemplate {
  role: "system" | "user" | "assistant" | string;
  content: string;
}

/**
 * Renders an array of chat message templates.
 */
export function renderChatMessages(
  messages: ChatMessageTemplate[],
  variables: Record<string, unknown> = {},
  options: RenderPromptOptions = {},
): ChatMessageTemplate[] {
  const strict = options.strict ?? true;

  if (strict) {
    const allRequiredVars = new Set<string>();
    for (const m of messages) {
      for (const v of extractTemplateVariables(m.content)) {
        allRequiredVars.add(v);
      }
    }

    for (const required of allRequiredVars) {
      if (variables[required] === undefined || variables[required] === null) {
        throw new PromptInterpolationError(
          `Missing variable in prompt messages interpolation: '{{${required}}}'`,
          required,
        );
      }
    }

    for (const provided of Object.keys(variables)) {
      if (!allRequiredVars.has(provided)) {
        throw new PromptInterpolationError(
          `Extraneous variable provided not present in messages template: '${provided}'`,
          provided,
        );
      }
    }
  }

  const result: ChatMessageTemplate[] = [];

  // If few-shot examples are present, insert them as conversational turns before the last user message
  if (options.fewShot && options.fewShot.length > 0) {
    const systemMsg = messages.find((m) => m.role === "system");
    if (systemMsg) {
      result.push({
        role: "system",
        content: renderTemplateString(systemMsg.content, variables, { strict: false }),
      });
    }

    for (const ex of options.fewShot) {
      result.push({ role: "user", content: ex.user });
      result.push({ role: "assistant", content: ex.assistant });
    }

    for (const m of messages.filter((m) => m.role !== "system")) {
      result.push({
        role: m.role,
        content: renderTemplateString(m.content, variables, { strict: false }),
      });
    }

    return result;
  }

  return messages.map((m) => ({
    role: m.role,
    content: renderTemplateString(m.content, variables, { strict: false }),
  }));
}
