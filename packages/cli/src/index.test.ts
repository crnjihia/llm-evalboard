import { describe, expect, it } from "vitest";
import { CLI_PACKAGE_NAME, program } from "./index.js";

describe("cli package", () => {
  it("exports package name and program", () => {
    expect(CLI_PACKAGE_NAME).toBe("@evalboard/cli");
    expect(program.name()).toBe("evalboard");
  });
});
