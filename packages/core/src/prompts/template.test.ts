import { describe, expect, it } from "vitest";
import {
  PromptInterpolationError,
  extractTemplateVariables,
  parsePromptFile,
  renderChatMessages,
  renderTemplateString,
} from "./template.js";

describe("prompt templates and interpolation", () => {
  it("extracts all declared variables in {{var}} format", () => {
    const template = "Hello {{ name }}, your order {{order_id}} has status {{status}}.";
    const vars = extractTemplateVariables(template);
    expect(vars).toEqual(["name", "order_id", "status"]);
  });

  it("strictly throws PromptInterpolationError on missing variables", () => {
    const template = "Analyze this text: {{text}} for sentiment with focus: {{focus}}";
    expect(() => renderTemplateString(template, { text: "Some positive feedback" })).toThrowError(
      PromptInterpolationError,
    );

    expect(() => renderTemplateString(template, { text: "Some positive feedback" })).toThrowError(
      /Missing variable.*focus/,
    );
  });

  it("strictly throws PromptInterpolationError on extra/extraneous variables", () => {
    const template = "Answer the question: {{query}}";
    expect(() =>
      renderTemplateString(template, {
        query: "What is 2 + 2?",
        unneeded_param: "surprise",
      }),
    ).toThrowError(PromptInterpolationError);

    expect(() =>
      renderTemplateString(template, {
        query: "What is 2 + 2?",
        unneeded_param: "surprise",
      }),
    ).toThrowError(/Extraneous variable.*unneeded_param/);
  });

  it("allows non-strict rendering when explicitly requested", () => {
    const template = "Hello {{name}}, code: {{code}}";
    const rendered = renderTemplateString(
      template,
      { name: "Alice", extra: "ignore" },
      { strict: false },
    );
    expect(rendered).toBe("Hello Alice, code: {{code}}");
  });

  it("renders chat messages strictly", () => {
    const messages = [
      { role: "system", content: "You are a {{role}} assistant." },
      { role: "user", content: "User: {{user_name}} says {{message}}" },
    ];

    const rendered = renderChatMessages(messages, {
      role: "financial",
      user_name: "Bob",
      message: "Check balance",
    });

    expect(rendered).toEqual([
      { role: "system", content: "You are a financial assistant." },
      { role: "user", content: "User: Bob says Check balance" },
    ]);
  });

  it("parses YAML front matter and formats few-shot examples", () => {
    const rawFile = `---
name: math-tutor
description: Solves arithmetic problems
few_shot:
  - user: "What is 1 + 1?"
    assistant: "1 + 1 = 2"
---
You are a helpful math tutor.
Solve: {{problem}}
`;

    const parsed = parsePromptFile(rawFile);
    expect(parsed.name).toBe("math-tutor");
    expect(parsed.description).toBe("Solves arithmetic problems");
    expect(parsed.fewShot).toHaveLength(1);

    const rendered = renderTemplateString(
      parsed.template,
      { problem: "3 * 4" },
      { fewShot: parsed.fewShot },
    );

    expect(rendered).toContain("[Example 1]");
    expect(rendered).toContain("User: What is 1 + 1?");
    expect(rendered).toContain("[Current Task]");
    expect(rendered).toContain("Solve: 3 * 4");
  });
});
