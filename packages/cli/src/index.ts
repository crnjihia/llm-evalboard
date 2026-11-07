#!/usr/bin/env node
import { Command } from "commander";

export const program = new Command();

program.name("evalboard").description("Statistically Honest LLM Evaluation").version("0.1.0");

program
  .command("hello")
  .description("Prints hello message for sanity checks")
  .action(() => {
    console.log("llm-evalboard: statistically honest evaluations ready.");
  });

export const CLI_PACKAGE_NAME = "@evalboard/cli";
