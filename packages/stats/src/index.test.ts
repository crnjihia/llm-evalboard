import { describe, expect, it } from "vitest";
import { STATS_PACKAGE_NAME } from "./index.js";

describe("stats package placeholder", () => {
  it("exports package name", () => {
    expect(STATS_PACKAGE_NAME).toBe("@evalboard/stats");
  });
});
