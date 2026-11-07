import { describe, expect, it } from "vitest";
import { WORKER_APP_NAME } from "./index.js";

describe("worker app placeholder", () => {
  it("exports app name", () => {
    expect(WORKER_APP_NAME).toBe("@evalboard/worker");
  });
});
