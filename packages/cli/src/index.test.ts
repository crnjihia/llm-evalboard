import { describe, expect, it, vi } from "vitest";
import { CLI_PACKAGE_NAME, program } from "./index.js";

describe("cli package", () => {
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
});
