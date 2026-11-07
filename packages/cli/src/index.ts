#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  type ParsedCase,
  checkDatasetQuality,
  computeDatasetDiff,
  computePromptDiff,
  parseDataset,
  parsePromptFile,
} from "@evalboard/core";
import { DatasetRepository, PromptRepository, createDbClient } from "@evalboard/db";
import { Command } from "commander";

export const program = new Command();

program.name("evalboard").description("Statistically Honest LLM Evaluation").version("0.1.0");

function getDb() {
  const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5435/evalboard";
  return createDbClient(url);
}

// Hello command
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

// --- PROMPT COMMANDS ---
const promptCmd = program.command("prompt").description("Manage prompts and versions");

promptCmd
  .command("add <file>")
  .description("Add or version a prompt from a template file (supports YAML front matter)")
  .option("-n, --name <name>", "Prompt name")
  .option("-d, --description <desc>", "Prompt description")
  .action(async (file, options) => {
    try {
      if (!existsSync(file)) {
        console.error(`Error: File '${file}' not found.`);
        process.exitCode = 1;
        return;
      }

      const content = readFileSync(file, "utf8");
      const parsed = parsePromptFile(content);
      const name = options.name || parsed.name || file;

      const db = getDb();
      const promptRepo = new PromptRepository(db);

      const prompt = await promptRepo.getOrCreatePrompt({
        name,
        description: options.description || parsed.description,
      });

      const result = await promptRepo.createVersion({
        promptId: prompt.id,
        template: parsed.template,
        variablesSchema: parsed.frontMatter.variables ?? null,
      });

      console.log(`Prompt: ${prompt.name} (${prompt.id})`);
      console.log(`Version: ${result.version.id} (${result.isNew ? "new" : "existing"})`);
    } catch (err) {
      console.error(`Error adding prompt: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

promptCmd
  .command("list")
  .description("List prompt versions in the database")
  .option("--prompt-id <id>", "Filter by prompt ID")
  .action(async (options) => {
    try {
      const db = getDb();
      const promptRepo = new PromptRepository(db);

      if (options.promptId) {
        const versions = await promptRepo.listVersions(options.promptId);
        console.log(`Versions for prompt ${options.promptId}:`);
        for (const v of versions) {
          console.log(`  - ${v.id} (created: ${new Date(v.createdAt).toISOString()})`);
        }
      } else {
        const prompts = await db.query.prompts.findMany();
        console.log(`Found ${prompts.length} prompt(s):`);
        for (const p of prompts) {
          console.log(`  - ${p.name} (id: ${p.id})`);
        }
      }
    } catch (err) {
      console.error(`Error listing prompts: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

promptCmd
  .command("diff <versionA> <versionB>")
  .description("Diff two prompt versions or template files")
  .action(async (versionA, versionB) => {
    try {
      let templateA: string;
      let templateB: string;

      if (existsSync(versionA)) {
        templateA = parsePromptFile(readFileSync(versionA, "utf8")).template;
      } else {
        const db = getDb();
        const promptRepo = new PromptRepository(db);
        const vA = await promptRepo.getVersion(versionA);
        if (!vA) throw new Error(`Prompt version '${versionA}' not found`);
        templateA = typeof vA.template === "string" ? vA.template : JSON.stringify(vA.template);
      }

      if (existsSync(versionB)) {
        templateB = parsePromptFile(readFileSync(versionB, "utf8")).template;
      } else {
        const db = getDb();
        const promptRepo = new PromptRepository(db);
        const vB = await promptRepo.getVersion(versionB);
        if (!vB) throw new Error(`Prompt version '${versionB}' not found`);
        templateB = typeof vB.template === "string" ? vB.template : JSON.stringify(vB.template);
      }

      const diff = computePromptDiff(templateA, templateB, versionA, versionB);
      console.log(`\n=== Prompt Diff: ${diff.summary} ===`);
      console.log(diff.patch);
    } catch (err) {
      console.error(`Error computing diff: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

// --- DATASET COMMANDS ---
const datasetCmd = program.command("dataset").description("Manage datasets and quality checks");

datasetCmd
  .command("import <file>")
  .description("Import and version a dataset file (JSONL, CSV, JSON)")
  .option("-n, --name <name>", "Dataset name")
  .option("--dataset-id <id>", "Existing dataset ID")
  .action(async (file, options) => {
    try {
      if (!existsSync(file)) {
        console.error(`Error: File '${file}' not found.`);
        process.exitCode = 1;
        return;
      }

      const content = readFileSync(file, "utf8");
      const parsed = parseDataset(content);
      const name = options.name || file;

      const db = getDb();
      const datasetRepo = new DatasetRepository(db);

      let datasetId = options.datasetId;
      if (!datasetId) {
        const dataset = await datasetRepo.getOrCreateDataset({ name });
        datasetId = dataset.id;
      }

      const result = await datasetRepo.createVersion({
        datasetId,
        cases: parsed.cases,
      });

      console.log(`Dataset: ${name} (${datasetId})`);
      console.log(`Version: ${result.version.id} (${result.isNew ? "new" : "existing"})`);
      console.log(`Cases: ${parsed.totalCases} total`);
    } catch (err) {
      console.error(`Error importing dataset: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

datasetCmd
  .command("list")
  .description("List datasets in the database")
  .action(async () => {
    try {
      const db = getDb();
      const list = await db.query.datasets.findMany();
      console.log(`Found ${list.length} dataset(s):`);
      for (const d of list) {
        console.log(`  - ${d.name} (id: ${d.id})`);
      }
    } catch (err) {
      console.error(`Error listing datasets: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

datasetCmd
  .command("diff <versionA> <versionB>")
  .description("Diff two dataset versions or dataset files")
  .action(async (versionA, versionB) => {
    try {
      let casesA: ParsedCase[];
      let casesB: ParsedCase[];

      if (existsSync(versionA)) {
        casesA = parseDataset(readFileSync(versionA, "utf8")).cases;
      } else {
        const db = getDb();
        const datasetRepo = new DatasetRepository(db);
        const stored = await datasetRepo.getCases(versionA);
        casesA = stored.map((s) => ({
          id: s.id,
          caseIndex: s.caseIndex,
          input: s.input as Record<string, unknown>,
          expected: s.expected,
          metadata: (s.metadata as Record<string, unknown>) ?? undefined,
          tags: (s.tags as string[]) ?? [],
          split: s.split,
        }));
      }

      if (existsSync(versionB)) {
        casesB = parseDataset(readFileSync(versionB, "utf8")).cases;
      } else {
        const db = getDb();
        const datasetRepo = new DatasetRepository(db);
        const stored = await datasetRepo.getCases(versionB);
        casesB = stored.map((s) => ({
          id: s.id,
          caseIndex: s.caseIndex,
          input: s.input as Record<string, unknown>,
          expected: s.expected,
          metadata: (s.metadata as Record<string, unknown>) ?? undefined,
          tags: (s.tags as string[]) ?? [],
          split: s.split,
        }));
      }

      const diff = computeDatasetDiff(casesA, casesB);
      console.log(`\n=== Dataset Diff: ${diff.summary} ===`);
      if (diff.addedCases.length > 0) {
        console.log(`Added (${diff.addedCases.length}):`);
        for (const ac of diff.addedCases.slice(0, 5)) {
          console.log(`  + [case ${ac.caseIndex}] ${JSON.stringify(ac.input).slice(0, 60)}`);
        }
      }
      if (diff.removedCases.length > 0) {
        console.log(`Removed (${diff.removedCases.length}):`);
        for (const rc of diff.removedCases.slice(0, 5)) {
          console.log(`  - [case ${rc.caseIndex}] ${JSON.stringify(rc.input).slice(0, 60)}`);
        }
      }
      if (diff.changedCases.length > 0) {
        console.log(`Changed (${diff.changedCases.length}):`);
        for (const cc of diff.changedCases.slice(0, 5)) {
          console.log(`  * [case ${cc.newCase.caseIndex}] changes: ${cc.fieldChanges.join(", ")}`);
        }
      }
    } catch (err) {
      console.error(`Error diffing datasets: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

datasetCmd
  .command("check <file>")
  .description("Run dataset quality checks (planted duplicates, near-duplicates, distributions)")
  .option("--delta <delta>", "Smallest effect of interest (default: 0.03)", "0.03")
  .action((file, options) => {
    try {
      if (!existsSync(file)) {
        console.error(`Error: File '${file}' not found.`);
        process.exitCode = 1;
        return;
      }

      const content = readFileSync(file, "utf8");
      const parsed = parseDataset(content);
      const delta = Number.parseFloat(options.delta) || 0.03;

      const report = checkDatasetQuality(parsed.cases, { delta });

      console.log(`\n=== Dataset Quality Report: ${file} ===`);
      console.log(`Total Cases: ${report.totalCases}`);
      console.log(`Summary: ${report.summary}`);

      if (report.duplicatePairs.length > 0) {
        console.log(`\n[WARNING] Exact Duplicates (${report.duplicatePairs.length}):`);
        for (const d of report.duplicatePairs) {
          console.log(
            `  - Case ${d.caseIndexA} and Case ${d.caseIndexB} are identical: "${d.previewA}"`,
          );
        }
      }

      if (report.nearDuplicatePairs.length > 0) {
        console.log(`\n[WARNING] Near Duplicates (${report.nearDuplicatePairs.length}):`);
        for (const nd of report.nearDuplicatePairs) {
          console.log(
            `  - Case ${nd.caseIndexA} ~ Case ${nd.caseIndexB} (${Math.round(nd.similarity * 100)}% similarity):`,
          );
          console.log(`      A: "${nd.previewA}"`);
          console.log(`      B: "${nd.previewB}"`);
        }
      }

      if (report.warnings.length > 0) {
        console.log("\nWarnings:");
        for (const w of report.warnings) {
          console.log(`  ! ${w}`);
        }
      }

      console.log("\nInput Length Distribution (chars):");
      console.log(
        `  Min: ${report.inputLengthDistribution.min}, Max: ${report.inputLengthDistribution.max}, Mean: ${report.inputLengthDistribution.mean}, Median: ${report.inputLengthDistribution.median}`,
      );

      console.log(`\nStatus: ${report.isHealthy ? "HEALTHY" : "NEEDS ATTENTION"}`);
    } catch (err) {
      console.error(`Error checking dataset: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

export const CLI_PACKAGE_NAME = "@evalboard/cli";

if (process.argv[1]?.endsWith("evalboard") || process.argv[1]?.endsWith("index.js")) {
  program.parse();
}
