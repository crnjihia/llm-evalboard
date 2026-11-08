import * as core from "@actions/core";
import { runAction } from "./runner.js";

export * from "./types.js";
export * from "./forest-plot.js";
export * from "./markdown.js";
export * from "./gatekeeper.js";
export * from "./github.js";
export * from "./observability/otel.js";
export * from "./observability/langfuse.js";
export * from "./runner.js";

export const ACTION_NAME = "@evalboard/action";

// Execute action if running in GitHub Actions environment
if (process.env.GITHUB_ACTIONS) {
  runAction().catch((err) => {
    core.setFailed(err instanceof Error ? err.message : String(err));
  });
}
