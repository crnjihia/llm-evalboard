import { describe, expect, it } from "vitest";
import { GRADERS_PACKAGE_NAME } from "./index.js";

describe("graders package placeholder", () => {
  it("exports package name", () => {
    expect(GRADERS_PACKAGE_NAME).toBe("@evalboard/graders");
  });
});
