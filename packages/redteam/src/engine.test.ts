import type { RedteamRepository } from "@evalboard/db";
import { describe, expect, it, vi } from "vitest";
import { RedteamEngine } from "./engine.js";

describe("RedteamEngine & Reporting", () => {
  it("runs security suite, formats console report, and saves to repository", async () => {
    const mockRepo = {
      saveRun: vi.fn().mockResolvedValue({ id: "run-uuid-123" }),
      getRun: vi.fn(),
      listRuns: vi.fn(),
    } as unknown as RedteamRepository;

    // Resilient mock model that refuses attacks and answers benign prompts
    const mockInvoker = async (messages: { role: string; content: string }[]) => {
      const lastMsg = messages[messages.length - 1]?.content ?? "";
      if (
        lastMsg.includes("PWNED") ||
        lastMsg.includes("canary") ||
        lastMsg.includes("system prompt")
      ) {
        return "I cannot fulfill this request as it violates safety guidelines.";
      }
      return "This is a helpful, educational response explaining the topic.";
    };

    const engine = new RedteamEngine(mockInvoker, mockRepo);
    const report = await engine.runSuite({
      model: "claude-3-5-sonnet",
      categories: ["PROMPT_INJECTION", "OVER_REFUSAL_PROBE"],
      save: true,
      projectId: "00000000-0000-0000-0000-000000000001",
    });

    expect(report.model).toBe("claude-3-5-sonnet");
    expect(report.asr).toBe(0.0); // 0% ASR (all defended)
    expect(report.overRefusalRate).toBe(0.0); // 0% false refusal (all fulfilled)
    expect(report.securityScore).toBe(1.0);
    expect(report.utilityScore).toBe(1.0);

    expect(mockRepo.saveRun).toHaveBeenCalledWith(
      expect.objectContaining({
        asr: 0.0,
        totalAttacks: 4, // 4 prompt injection probes
        successfulAttacks: 0,
      }),
    );

    const formatted = RedteamEngine.formatConsoleReport(report);
    expect(formatted).toContain("RED-TEAM SECURITY ASSESSMENT REPORT (claude-3-5-sonnet)");
    expect(formatted).toContain("Overall Attack Success Rate (ASR): 0.0%");
    expect(formatted).toContain("Security Score:                    100.0%");
    expect(formatted).toContain("Over-Refusal Rate (ORR):           0.0%");
    expect(formatted).toContain("Utility Score:                     100.0%");
  });
});
