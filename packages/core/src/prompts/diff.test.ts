import { describe, expect, it } from "vitest";
import { computePromptDiff } from "./diff.js";

describe("prompt diff computation", () => {
  it("detects additions and removals between prompt strings", () => {
    const v1 = `You are a helpful assistant.
Answer briefly.`;

    const v2 = `You are an expert math assistant.
Answer step by step.
Include units.`;

    const diff = computePromptDiff(v1, v2, "v1", "v2");

    expect(diff.linesAdded).toBeGreaterThanOrEqual(2);
    expect(diff.linesRemoved).toBeGreaterThanOrEqual(1);
    expect(diff.summary).toContain("Prompt updated");
    expect(diff.patch).toContain("-You are a helpful assistant.");
    expect(diff.patch).toContain("+You are an expert math assistant.");
  });

  it("reports no changes for identical templates", () => {
    const template = "Single instruction template";
    const diff = computePromptDiff(template, template);

    expect(diff.linesAdded).toBe(0);
    expect(diff.linesRemoved).toBe(0);
    expect(diff.summary).toBe("No changes");
  });
});
