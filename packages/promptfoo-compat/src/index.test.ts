import { describe, expect, it } from "vitest";
import { PROMPTFOO_COMPAT_PACKAGE_NAME } from "./index.js";

describe("promptfoo-compat package placeholder", () => {
  it("exports package name", () => {
    expect(PROMPTFOO_COMPAT_PACKAGE_NAME).toBe("@evalboard/promptfoo-compat");
  });
});
