import { describe, expect, it } from "vitest";
import { ACTION_NAME } from "./index.js";

describe("action package placeholder", () => {
  it("exports action name", () => {
    expect(ACTION_NAME).toBe("@evalboard/action");
  });
});
