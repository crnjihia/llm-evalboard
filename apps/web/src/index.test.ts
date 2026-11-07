import { describe, expect, it } from "vitest";
import { WEB_APP_NAME } from "./index.js";

describe("web app placeholder", () => {
  it("exports app name", () => {
    expect(WEB_APP_NAME).toBe("@evalboard/web");
  });
});
