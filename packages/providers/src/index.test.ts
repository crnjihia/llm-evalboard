import { describe, expect, it } from "vitest";
import { PROVIDERS_PACKAGE_NAME } from "./index.js";

describe("providers package placeholder", () => {
  it("exports package name", () => {
    expect(PROVIDERS_PACKAGE_NAME).toBe("@evalboard/providers");
  });
});
