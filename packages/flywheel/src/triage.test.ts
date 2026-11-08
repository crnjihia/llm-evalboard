import { describe, expect, it } from "vitest";
import { classifyTrace } from "./triage.js";

describe("Triage Classification Engine", () => {
  it("classifies explicit negative user feedback as CRITICAL/PROMOTE", () => {
    const trace = {
      id: "tr-001",
      output: "Here is your report.",
      feedback: {
        flagged: true,
        rating: -1,
        comment: "This is completely wrong and hallucinated numbers.",
      },
    };

    const classification = classifyTrace(trace);
    expect(classification.priority).toBe("CRITICAL");
    expect(classification.suggestedAction).toBe("PROMOTE");
    expect(classification.reasons).toEqual(
      expect.arrayContaining([
        "Explicitly flagged by user",
        "Negative rating received (-1)",
        expect.stringContaining("User complaint keywords detected"),
      ]),
    );
  });

  it("classifies low evaluation score as HIGH/PROMOTE", () => {
    const trace = {
      id: "tr-002",
      output: "The answer is 42.",
      score: 0.25,
    };

    const classification = classifyTrace(trace);
    expect(classification.priority).toBe("HIGH");
    expect(classification.suggestedAction).toBe("PROMOTE");
    expect(classification.reasons).toContain("Critically low evaluation score (0.25)");
  });

  it("classifies server error pattern as HIGH/PROMOTE", () => {
    const trace = {
      id: "tr-003",
      output: "Error: Internal Server Error 500 when calling backend service.",
    };

    const classification = classifyTrace(trace);
    expect(classification.priority).toBe("HIGH");
    expect(classification.suggestedAction).toBe("PROMOTE");
    expect(classification.reasons.some((r) => r.toLowerCase().includes("internal"))).toBe(true);
  });

  it("classifies empty output as HIGH/PROMOTE", () => {
    const trace = {
      id: "tr-004",
      output: "   ",
    };

    const classification = classifyTrace(trace);
    expect(classification.priority).toBe("HIGH");
    expect(classification.suggestedAction).toBe("PROMOTE");
    expect(classification.reasons).toContain("Empty model output received");
  });

  it("classifies normal passing execution as LOW/DISCARD", () => {
    const trace = {
      id: "tr-005",
      output: "Paris is the capital of France.",
      score: 1.0,
      feedback: {
        rating: 1,
        comment: "Great response!",
      },
    };

    const classification = classifyTrace(trace);
    expect(classification.priority).toBe("LOW");
    expect(classification.suggestedAction).toBe("DISCARD");
    expect(classification.reasons.length).toBe(0);
  });
});
