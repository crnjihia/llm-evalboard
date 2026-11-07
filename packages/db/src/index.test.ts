import { describe, expect, it } from "vitest";
import { DB_PACKAGE_NAME, systemHealth } from "./index.js";

describe("db package", () => {
  it("exports package name and schema", () => {
    expect(DB_PACKAGE_NAME).toBe("@evalboard/db");
    expect(systemHealth).toBeDefined();
  });
});
