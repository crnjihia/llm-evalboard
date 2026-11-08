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

  it("lists red-team attack categories via redteam categories", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync(["node", "evalboard", "redteam", "categories"]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      expect(logged).toContain("RED-TEAM ATTACK TAXONOMY CATEGORIES");
      expect(logged).toContain("PROMPT_INJECTION");
      expect(logged).toContain("JAILBREAK");
      expect(logged).toContain("PII_EXTRACTION");
      expect(logged).toContain("OVER_REFUSAL_PROBE");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("executes red-team assessment against mock-safe target", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "evalboard",
        "redteam",
        "run",
        "--model",
        "mock-safe",
        "--categories",
        "PROMPT_INJECTION,OVER_REFUSAL_PROBE",
      ]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      expect(logged).toContain("RED-TEAM SECURITY ASSESSMENT REPORT (mock-safe)");
      expect(logged).toContain("Overall Attack Success Rate (ASR): 0.0%");
      expect(logged).toContain("Security Score:                    100.0%");
      expect(logged).toContain("CATEGORY BREAKDOWN:");
      expect(logged).toContain("PROMPT_INJECTION");
      expect(logged).toContain("OVER_REFUSAL_PROBE");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("imports promptfooconfig into Evalboard suite and dataset files via promptfoo import", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-cli-pf-import-"));
    const pfConfigPath = join(tempDir, "promptfooconfig.yaml");
    const suiteOutPath = join(tempDir, "evalboard-suite.yaml");
    const datasetOutPath = join(tempDir, "dataset.jsonl");

    const pfYaml = `
description: "CLI Import Test"
prompts:
  - "Hello {{name}}"
providers:
  - "mock:echo"
tests:
  - vars:
      name: "Alice"
    assert:
      - type: equals
        value: "Hello Alice"
`;
    writeFileSync(pfConfigPath, pfYaml, "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "evalboard",
        "promptfoo",
        "import",
        pfConfigPath,
        "--suite",
        "Imported CLI Suite",
        "--out",
        suiteOutPath,
        "--dataset-out",
        datasetOutPath,
      ]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      expect(logged).toContain("=== Importing Promptfoo Configuration:");
      expect(logged).toContain("Suite Name:     Imported CLI Suite");
      expect(logged).toContain("Prompts:        1");
      expect(logged).toContain("Test Cases:     1");
      expect(logged).toContain("Evalboard Suite YAML written to:");
      expect(logged).toContain("Dataset JSONL written to:");
    } finally {
      logSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("runs promptfoo shadow execution command with repeats and formats table", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-cli-pf-shadow-"));
    const pfConfigPath = join(tempDir, "promptfooconfig.yaml");

    const pfYaml = `
prompts:
  - "{{text}}"
providers:
  - "mock:echo"
tests:
  - vars:
      text: "hello world"
    assert:
      - type: contains
        value: "world"
`;
    writeFileSync(pfConfigPath, pfYaml, "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "evalboard",
        "promptfoo",
        "shadow",
        pfConfigPath,
        "--repeats",
        "2",
        "--model",
        "mock:echo",
      ]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      expect(logged).toContain("Initializing Promptfoo Shadow Execution");
      expect(logged).toContain("EVALBOARD PROMPTFOO SHADOW RUN EXECUTION REPORT");
      expect(logged).toContain("Promptfoo Pass Rate (Turn 1):");
      expect(logged).toContain("Evalboard Pass Rate (R=2):");
      expect(logged).toContain("DIVERGENCE & STOCHASTIC INSTABILITY ANALYSIS:");
    } finally {
      logSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exports Evalboard suite back to Promptfoo YAML via promptfoo export", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "evalboard-cli-pf-export-"));
    const suitePath = join(tempDir, "suite.yaml");
    const datasetPath = join(tempDir, "dataset.jsonl");
    const outPfPath = join(tempDir, "exported-promptfoo.yaml");

    const datasetContent = `{"input": {"val": "test"}, "expected": "test"}\n`;
    writeFileSync(datasetPath, datasetContent, "utf8");

    const suiteContent = `
name: Export Test Suite
prompts:
  - "Echo {{val}}"
models:
  - provider: mock
    model: echo
dataset: "${datasetPath.replace(/\\/g, "/")}"
baseline:
  prompt: "Echo {{val}}"
  model: echo
graders:
  - type: exact
    config:
      trim: true
`;
    writeFileSync(suitePath, suiteContent, "utf8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await program.parseAsync([
        "node",
        "evalboard",
        "promptfoo",
        "export",
        suitePath,
        "--out",
        outPfPath,
      ]);
      const logged = logSpy.mock.calls.map((c) => c.join(" ")).join("\n");

      expect(logged).toContain("Promptfoo YAML written to:");
    } finally {
      logSpy.mockRestore();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
