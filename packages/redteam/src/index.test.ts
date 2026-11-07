import { describe, expect, it } from "vitest";
import { REDTEAM_PACKAGE_NAME } from "./index.js";

describe("redteam package placeholder", () => {
  it("exports package name", () => {
    expect(REDTEAM_PACKAGE_NAME).toBe("@evalboard/redteam");
  });
});
