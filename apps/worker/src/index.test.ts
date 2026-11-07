import { describe, expect, it } from "vitest";
import { WORKER_APP_NAME, WorkerService } from "./index.js";

describe("worker application and pg-boss queue runner", () => {
  it("exports worker application name and service", () => {
    expect(WORKER_APP_NAME).toBe("@evalboard/worker");
    const worker = new WorkerService("postgresql://postgres:postgres@localhost:5435/evalboard");
    expect(worker).toBeDefined();
    expect(worker.getBoss()).toBeNull();
  });
});
