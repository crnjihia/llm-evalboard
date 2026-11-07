import { describe, expect, it } from "vitest";
import { FLYWHEEL_PACKAGE_NAME } from "./index.js";

describe("flywheel package placeholder", () => {
  it("exports package name", () => {
    expect(FLYWHEEL_PACKAGE_NAME).toBe("@evalboard/flywheel");
  });
});
