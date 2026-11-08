import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CLI_PACKAGE_NAME, program } from "./index.js";

describe("cli prompt and dataset commands", () => {
  it("exports package name and program", () => {
    expect(CLI_PACKAGE_NAME).toBe("@evalboard/cli");
    expect(program.name()).toBe("evalboard");
  });

  it("executes hello eval smoke test", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    program.parse(["node", "evalboard", "hello"]);
    expect(logSpy).toHaveBeenCalledWith("=== llm-evalboard: Hello Eval ===");
    logSpy.mockRestore();
  });

  it("flags planted duplicates when running dataset check on a fixture", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-cli-test-"));
    const fixturePath = join(tempDir, "cases-with-planted-duplicates.jsonl");

    // Fixture with planted exact duplicate
    const fixtureContent = `{"input": {"query": "What is the capital of Kenya?"}, "expected": "Nairobi"}
{"input": {"query": "What is the boiling point of water?"}, "expected": "100 C"}
{"input": {"query": "What is the capital of Kenya?"}, "expected": "Nairobi"}`;

    writeFileSync(fixturePath, fixtureContent, "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "evalboard", "dataset", "check", fixturePath]);

      const loggedMessages = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      // Verify planted duplicates are flagged
      expect(loggedMessages).toContain("[WARNING] Exact Duplicates (1)");
      expect(loggedMessages).toContain("Case 0 and Case 2 are identical");
      expect(loggedMessages).toContain("What is the capital of Kenya?");
      expect(loggedMessages).toContain("Status: NEEDS ATTENTION");
    } finally {
      logSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs prompt diff between two template files", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-cli-prompt-test-"));
    const v1Path = join(tempDir, "v1.md");
    const v2Path = join(tempDir, "v2.md");

    writeFileSync(v1Path, "You are a basic bot.\nAnswer queries.", "utf8");
    writeFileSync(v2Path, "You are an expert bot.\nAnswer queries step-by-step.", "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "evalboard", "prompt", "diff", v1Path, v2Path]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("=== Prompt Diff: Prompt updated");
    } finally {
      logSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("lists available built-in deterministic graders via grade list", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "evalboard", "grade", "list"]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("=== Available Built-in Deterministic Graders ===");
      expect(logged).toContain("- exact");
      expect(logged).toContain("- regex");
      expect(logged).toContain("- json-schema");
      expect(logged).toContain("- numeric");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("tests a grader from cli via grade test", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "evalboard",
        "grade",
        "test",
        "exact",
        "-o",
        "hello",
        "-e",
        "hello",
      ]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("=== Grader Test: exact ===");
      expect(logged).toContain("Verdict:    PASS");
      expect(logged).toContain("Score:      1");
      expect(logged).toContain("Reason:     Exact match succeeded");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("generates judge calibration report via calibrate report", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "evalboard",
        "calibrate",
        "report",
        "--judge",
        "mock-judge-v1",
      ]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");
      expect(logged).toContain("# Judge Calibration Report: Overall Quality");
      expect(logged).toContain("Agreement Statistics");
      expect(logged).toContain("Cohen's Kappa (κ)");
      expect(logged).toContain("Confusion Matrix");
      expect(logged).toContain("Length Bias Analysis");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("registers compare command with delta and baseline options", () => {
    const compareCmd = program.commands.find((c) => c.name() === "compare");
    expect(compareCmd).toBeDefined();
    expect(compareCmd?.description()).toContain("Compare cells of an evaluation run");
    const optionFlags = compareCmd?.options.map((o) => o.flags);
    expect(optionFlags).toContain("-b, --baseline <cellId>");
    expect(optionFlags).toContain("-c, --candidate <cellId>");
    expect(optionFlags).toContain("-d, --delta <number>");
    expect(optionFlags).toContain("-s, --seed <number>");
  });

  it("registers flywheel command with ingest, triage, and promote subcommands", () => {
    const flywheelCmd = program.commands.find((c) => c.name() === "flywheel");
    expect(flywheelCmd).toBeDefined();
    const subNames = flywheelCmd?.commands.map((c) => c.name());
    expect(subNames).toContain("ingest");
    expect(subNames).toContain("triage");
    expect(subNames).toContain("promote");
  });

  it("runs flywheel ingest on a fixture with PII and negative feedback", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-flywheel-test-"));
    const traceFile = join(tempDir, "production-traces.jsonl");

    const tracesContent = `{"id": "tr-cli-001", "input": {"query": "User john.doe@example.com reported failure"}, "output": "Charged 4532-0151-1283-0366", "model": "gpt-4o", "feedback": {"rating": -1, "comment": "Wrong amount billed"}}`;
    writeFileSync(traceFile, tracesContent, "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "evalboard", "flywheel", "ingest", traceFile]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      expect(logged).toContain("=== Ingesting 1 Production Trace(s) ===");
      expect(logged).toContain("PII Redaction: Active");
      expect(logged).toContain("Successfully ingested: 1 traces");
      expect(logged).toContain("PII Redactions Applied: 2 (EMAIL, CREDIT_CARD)");
      expect(logged).toContain("Triage Priority Breakdown:");
      expect(logged).toContain("HIGH:     1");
    } finally {
      logSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
