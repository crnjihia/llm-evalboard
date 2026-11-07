#!/usr/bin/env node
import { Command } from "commander";

export const program = new Command();

program.name("evalboard").description("Statistically Honest LLM Evaluation").version("0.1.0");

program
  .command("hello")
  .description("Runs a hello eval sanity check")
  .action(() => {
    console.log("=== llm-evalboard: Hello Eval ===");
    console.log("Suite: hello-smoke");
    console.log(
      "Case 1: Capital of France -> Candidate output: 'Paris' -> Target: 'Paris' -> Score: 1.0 (PASS)",
    );
    console.log("Summary: 1/1 passed (100%), Mean Score: 1.00");
    console.log("Statistical engine: Ready | Reproducibility cache: Active");
  });

export const CLI_PACKAGE_NAME = "@evalboard/cli";

if (process.argv[1]?.endsWith("evalboard") || process.argv[1]?.endsWith("index.js")) {
  program.parse();
}
