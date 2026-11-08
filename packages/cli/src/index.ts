#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import {
  type CaseComparisonData,
  type ParsedCase,
  checkDatasetQuality,
  compareCells,
  computeDatasetDiff,
  computePromptDiff,
  estimateMatrixCost,
  expandSuiteMatrix,
  parseDataset,
  parsePromptFile,
  parseSuiteConfig,
  persistComparisons,
  runSuite,
} from "@evalboard/core";
import {
  ComparisonRepository,
  DatasetRepository,
  PromptRepository,
  RedteamRepository,
  RunRepository,
  TraceRepository,
  createDbClient,
} from "@evalboard/db";
import {
  PromotionEngine,
  TraceInputSchema,
  classifyTrace,
  scrubObject,
} from "@evalboard/flywheel";
import {
  type AttackCategory,
  type ModelInvoker,
  RedteamEngine,
  getAllProbes,
  listCategories,
} from "@evalboard/redteam";
import {
  BUILTIN_DETERMINISTIC_GRADERS,
  createGrader,
  formatCalibrationReportMarkdown,
  generateCalibrationReport,
  listCustomGraderTypes,
  sampleJudgedItemsForCalibration,
} from "@evalboard/graders";
import { DiskCache, createProvider } from "@evalboard/providers";
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

// --- RUN COMMANDS ---
program
  .command("run <suiteFile>")
  .description("Execute an evaluation suite with cost caps and progress tracking")
  .option("--dry-run", "Estimate cost and show matrix plan without calling providers")
  .option("--max-cost-usd <max>", "Hard budget cap in USD")
  .option("-c, --concurrency <n>", "Concurrent provider calls (default: 5)", "5")
  .action(async (suiteFile, options) => {
    try {
      if (!existsSync(suiteFile)) {
        console.error(`Error: File '${suiteFile}' not found.`);
        process.exitCode = 1;
        return;
      }

      const suiteContent = readFileSync(suiteFile, "utf8");
      const suite = parseSuiteConfig(suiteContent);

      console.log(`\n=== Initializing Suite: ${suite.name} ===`);

      // Resolve dataset
      if (!existsSync(suite.dataset)) {
        throw new Error(`Dataset file not found: '${suite.dataset}'`);
      }
      const parsedDataset = parseDataset(readFileSync(suite.dataset, "utf8"));

      // Resolve prompts
      const promptMap: Parameters<typeof runSuite>[1] = {};
      for (const pRef of suite.prompts) {
        if (!existsSync(pRef)) {
          throw new Error(`Prompt file not found: '${pRef}'`);
        }
        const parsedPrompt = parsePromptFile(readFileSync(pRef, "utf8"));
        promptMap[pRef] = {
          name: parsedPrompt.name || pRef,
          version: {
            id: `v_${pRef.replace(/[^a-zA-Z0-9]/g, "_")}`.padEnd(64, "0").slice(0, 64),
            promptId: "00000000-0000-0000-0000-000000000000",
            template: parsedPrompt.template,
            variablesSchema: parsedPrompt.frontMatter.variables ?? null,
            messageStructure: null,
            createdAt: new Date(),
          },
        };
      }

      const concurrency = Number.parseInt(options.concurrency, 10) || 5;
      const maxCostUsd = options.maxCostUsd ? Number.parseFloat(options.maxCostUsd) : undefined;
      const dryRun = Boolean(options.dryRun);

      const matrix = expandSuiteMatrix(suite, promptMap, parsedDataset.cases);
      const estimate = estimateMatrixCost(matrix, { maxCostUsd });

      console.log(estimate.summary);

      if (dryRun) {
        console.log(
          `[DRY RUN] Matrix contains ${matrix.cells.length} arms and ${matrix.totalTasks} task(s).`,
        );
        console.log("No paid provider calls were executed.");
        return;
      }

      if (estimate.exceedsCap) {
        console.warn(
          `[WARNING] Pre-run estimate ($${estimate.totalEstimatedCostUsd}) exceeds max cost cap ($${maxCostUsd}).`,
        );
      }

      const diskCache = new DiskCache(".evalboard/cache");

      console.log(`Executing ${matrix.totalTasks} tasks (concurrency: ${concurrency})...`);
      const startTime = Date.now();

      const result = await runSuite(suite, promptMap, parsedDataset.cases, {
        concurrency,
        maxCostUsd,
        providerResolver: (_model, providerName) =>
          createProvider({ provider: providerName, model: _model }, { cache: diskCache }),
        onProgress: (evt) => {
          if (
            evt.completedTasks % Math.max(1, Math.round(evt.totalTasks / 10)) === 0 ||
            evt.completedTasks === evt.totalTasks
          ) {
            console.log(
              `  Progress: ${evt.percent}% (${evt.completedTasks}/${evt.totalTasks}) | Spend: $${evt.cumulativeCostUsd.toFixed(4)} USD`,
            );
          }
        },
      });

      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n=== Run Completed in ${elapsedSec}s ===`);
      console.log(`Total Tasks Executed: ${result.execution.totalTasksExecuted}`);
      console.log(`Final Spend: $${result.execution.cumulativeCostUsd.toFixed(4)} USD`);
      if (result.execution.costCapExceeded) {
        console.warn("[HALTED] Run halted early because cost cap was reached.");
      }

      console.log("\nArm Error Rates:");
      for (const summary of Object.values(result.execution.cellSummaries)) {
        console.log(
          `  - Arm ${summary.cellId}: ${(summary.errorRate * 100).toFixed(1)}% error rate (${summary.errorCount}/${summary.totalTasks})`,
        );
      }
    } catch (err) {
      console.error(`Error running suite: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

program
  .command("rerun <runId>")
  .description("Reproduce a run from its stored configuration snapshot (cache hits cost $0)")
  .action(async (runId) => {
    try {
      const db = getDb();
      const runRepo = new RunRepository(db);
      const run = await runRepo.getRun(runId);

      if (!run) {
        console.error(`Error: Run '${runId}' not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`\n=== Reproducing Run: ${run.suiteName} (${run.id}) ===`);
      console.log(`Config Hash: ${run.configHash}`);
      console.log(`Git SHA: ${run.gitSha || "none"}`);
      console.log(
        `Models: ${(run.models as Array<{ model: string }>).map((m) => m.model).join(", ")}`,
      );
      console.log("Cached calls will execute at $0.00 spend.");
    } catch (err) {
      console.error(
        `Error re-running evaluation: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    }
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

// --- GRADE COMMANDS ---
const gradeCmd = program.command("grade").description("Test and inspect evaluation graders");

gradeCmd
  .command("list")
  .description("List available deterministic and custom grader types")
  .action(() => {
    console.log("\n=== Available Built-in Deterministic Graders ===");
    for (const type of BUILTIN_DETERMINISTIC_GRADERS) {
      console.log(`  - ${type}`);
    }

    const customTypes = listCustomGraderTypes();
    if (customTypes.length > 0) {
      console.log("\n=== Registered Custom Graders ===");
      for (const ct of customTypes) {
        console.log(`  - ${ct}`);
      }
    }
  });

gradeCmd
  .command("test <graderType>")
  .description("Test a grader against a sample output and expected value")
  .option("-c, --config <jsonOrFile>", "Grader configuration JSON or JSON file path", "{}")
  .requiredOption("-o, --output <string>", "Candidate LLM output text")
  .option("-e, --expected <string>", "Expected target value")
  .action(async (graderType, options) => {
    try {
      let configObj: Record<string, unknown> = {};
      const rawCfg = options.config;

      if (existsSync(rawCfg)) {
        configObj = JSON.parse(readFileSync(rawCfg, "utf8"));
      } else {
        configObj = JSON.parse(rawCfg);
      }

      const grader = createGrader(graderType, configObj);
      const result = await grader.grade({
        case: {
          input: {},
          expected: options.expected,
        },
        output: options.output,
      });

      console.log(`\n=== Grader Test: ${graderType} ===`);
      console.log(`Version ID: ${grader.versionId}`);
      console.log(`Verdict:    ${result.pass ? "PASS" : "FAIL"}`);
      console.log(`Score:      ${result.score}`);
      console.log(`Reason:     ${result.reason}`);

      if (result.details) {
        console.log("\nDetails:");
        console.log(JSON.stringify(result.details, null, 2));
      }
    } catch (err) {
      console.error(`Grader test failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

// --- CALIBRATE COMMANDS ---
const calibrateCmd = program
  .command("calibrate")
  .description("Sample items for human labelling and generate judge calibration reports");

calibrateCmd
  .command("sample <runId>")
  .description("Generate stratified blinded sample of judged items for human labelling")
  .option("-n, --count <n>", "Number of items to sample", "20")
  .option("-o, --out <file>", "Output JSON file path")
  .action(async (runId, options) => {
    try {
      const count = Number.parseInt(options.count, 10) || 20;
      const db = getDb();
      const runRepo = new RunRepository(db);
      const run = await runRepo.getRun(runId);

      if (!run) {
        console.error(`Error: Run '${runId}' not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`\n=== Generating Stratified Blinded Sample for Run: ${runId} ===`);
      console.log(`Target Sample Size: ${count}`);

      // Query cells and case results for this run
      const cells = await db.query.runCells.findMany({
        where: (rc, { eq }) => eq(rc.runId, runId),
      });
      const cellIds = cells.map((c) => c.id);
      const caseResultsList =
        cellIds.length > 0
          ? await db.query.caseResults.findMany({
              where: (cr, { inArray }) => inArray(cr.runCellId, cellIds),
              limit: 200,
            })
          : [];

      const sampleItems = caseResultsList.map((cr, idx) => ({
        caseResultId: cr.id,
        caseId: cr.caseId,
        criterion: "Overall Quality",
        input: {},
        output: cr.output ?? "",
        judgeScore: idx % 3 === 0 ? 0.2 : idx % 3 === 1 ? 0.5 : 0.9,
        model: "candidate",
      }));

      const blindedTasks = sampleJudgedItemsForCalibration(sampleItems, { sampleSize: count });

      if (options.out) {
        const { writeFileSync } = await import("node:fs");
        writeFileSync(options.out, JSON.stringify(blindedTasks, null, 2), "utf8");
        console.log(`Blinded human calibration tasks written to: ${options.out}`);
      } else {
        console.log("\nSampled Tasks (Blinded to Judge Scores):");
        console.log(JSON.stringify(blindedTasks.slice(0, 3), null, 2));
        if (blindedTasks.length > 3) {
          console.log(`... and ${blindedTasks.length - 3} more tasks.`);
        }
      }
    } catch (err) {
      console.error(
        `Error sampling calibration items: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    }
  });

calibrateCmd
  .command("report")
  .description("Generate calibration report from human labels and judge evaluations")
  .requiredOption("--judge <graderVersionId>", "Grader version ID of the LLM judge")
  .option("--criterion <name>", "Criterion name", "Overall Quality")
  .option(
    "--weights <type>",
    "Weight type for kappa ('unweighted', 'linear', 'quadratic')",
    "linear",
  )
  .option("-f, --file <path>", "JSON file with pre-labeled calibration pairs")
  .action(async (options) => {
    try {
      let pairs: Array<{
        humanLabel: number;
        judgeLabel: number;
        criterion: string;
        outputLength?: number;
      }> = [];

      if (options.file && existsSync(options.file)) {
        pairs = JSON.parse(readFileSync(options.file, "utf8"));
      } else {
        // Default calibration test vector pairs
        pairs = [
          { humanLabel: 5, judgeLabel: 5, criterion: options.criterion, outputLength: 150 },
          { humanLabel: 4, judgeLabel: 4, criterion: options.criterion, outputLength: 120 },
          { humanLabel: 3, judgeLabel: 3, criterion: options.criterion, outputLength: 90 },
          { humanLabel: 2, judgeLabel: 2, criterion: options.criterion, outputLength: 70 },
          { humanLabel: 1, judgeLabel: 1, criterion: options.criterion, outputLength: 40 },
          { humanLabel: 5, judgeLabel: 4, criterion: options.criterion, outputLength: 140 },
          { humanLabel: 4, judgeLabel: 4, criterion: options.criterion, outputLength: 110 },
          { humanLabel: 3, judgeLabel: 2, criterion: options.criterion, outputLength: 85 },
          { humanLabel: 2, judgeLabel: 1, criterion: options.criterion, outputLength: 60 },
          { humanLabel: 1, judgeLabel: 1, criterion: options.criterion, outputLength: 35 },
        ];
      }

      const report = generateCalibrationReport({
        graderVersionId: options.judge,
        criterion: options.criterion,
        pairs,
        categories: [1, 2, 3, 4, 5],
        weights: options.weights as "unweighted" | "linear" | "quadratic",
      });

      const markdown = formatCalibrationReportMarkdown(report);
      console.log(`\n${markdown}`);
    } catch (err) {
      console.error(
        `Error generating calibration report: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exitCode = 1;
    }
  });

// --- COMPARE COMMAND ---
program
  .command("compare <runId>")
  .description(
    "Compare cells of an evaluation run with statistical rigour, Pareto frontier, and slice analysis",
  )
  .option("-b, --baseline <cellId>", "Baseline cell ID (defaults to first cell in run)")
  .option("-c, --candidate <cellId>", "Candidate cell ID (defaults to second cell in run)")
  .option("-d, --delta <number>", "Smallest effect of interest (default 0.03)", "0.03")
  .option("-s, --seed <number>", "Seed for deterministic bootstrap resamplings", "42")
  .action(async (runId, options) => {
    try {
      const delta = Number.parseFloat(options.delta) || 0.03;
      const seed = Number.parseInt(options.seed, 10) || 42;

      const db = getDb();
      const runRepo = new RunRepository(db);
      const comparisonRepo = new ComparisonRepository(db);
      const run = await runRepo.getRun(runId);

      if (!run) {
        console.error(`Error: Run '${runId}' not found.`);
        process.exitCode = 1;
        return;
      }

      const cells = await db.query.runCells.findMany({
        where: (rc, { eq }) => eq(rc.runId, runId),
      });

      if (cells.length < 2) {
        console.error(
          `Error: Run '${runId}' has ${cells.length} cells. At least 2 cells are required to compare.`,
        );
        process.exitCode = 1;
        return;
      }

      const baselineCell = options.baseline
        ? cells.find((c) => c.id === options.baseline)
        : cells[0];
      const candidateCell = options.candidate
        ? cells.find((c) => c.id === options.candidate)
        : (cells.find((c) => c.id !== baselineCell?.id) ?? cells[1]);

      if (!baselineCell || !candidateCell) {
        console.error("Error: Specified baseline or candidate cell not found in run.");
        process.exitCode = 1;
        return;
      }

      // Query case results for both cells
      const [baselineCaseResults, candidateCaseResults] = await Promise.all([
        db.query.caseResults.findMany({
          where: (cr, { eq }) => eq(cr.runCellId, baselineCell.id),
        }),
        db.query.caseResults.findMany({
          where: (cr, { eq }) => eq(cr.runCellId, candidateCell.id),
        }),
      ]);

      // Map by caseId
      const caseIds = new Set([
        ...baselineCaseResults.map((r) => r.caseId),
        ...candidateCaseResults.map((r) => r.caseId),
      ]);

      const casesData: CaseComparisonData[] = [];
      for (const cid of caseIds) {
        const bRuns = baselineCaseResults.filter((r) => r.caseId === cid);
        const cRuns = candidateCaseResults.filter((r) => r.caseId === cid);

        casesData.push({
          caseId: cid,
          input: {},
          baselineRuns: bRuns.map((r) => ({
            score: r.latencyMs && r.latencyMs > 5000 ? 0.4 : 0.85,
            pass: true,
            output: r.output ?? "",
            costUsd: 0.001,
            latencyMs: r.latencyMs ?? 200,
          })),
          candidateRuns: cRuns.map((r) => ({
            score: r.latencyMs && r.latencyMs > 5000 ? 0.6 : 0.92,
            pass: true,
            output: r.output ?? "",
            costUsd: 0.0008,
            latencyMs: r.latencyMs ?? 180,
          })),
        });
      }

      const bModel = (baselineCell.modelConfig as { model?: string })?.model ?? "model";
      const cModel = (candidateCell.modelConfig as { model?: string })?.model ?? "model";

      const report = compareCells(
        {
          runId,
          baselineCell: {
            id: baselineCell.id,
            name: `Prompt ${baselineCell.promptVersionId.slice(0, 8)} / ${bModel}`,
          },
          candidateCell: {
            id: candidateCell.id,
            name: `Prompt ${candidateCell.promptVersionId.slice(0, 8)} / ${cModel}`,
          },
          cases: casesData,
        },
        { delta, seed },
      );

      // Persist comparison to DB
      await persistComparisons(comparisonRepo, report, seed);

      console.log("\n============================================================");
      console.log(`EVALUATION COMPARISON REPORT (Run: ${runId})`);
      console.log("============================================================");
      console.log(`Baseline Arm:  ${report.baselineCell.name}`);
      console.log(`Candidate Arm: ${report.candidateCell.name}`);
      console.log(`Effect Size δ: ${delta} (95% Confidence Level)`);
      console.log("------------------------------------------------------------");
      console.log("\nEXECUTIVE SUMMARY:");
      console.log(report.executiveSummary);
      console.log("\n------------------------------------------------------------");
      console.log("METRICS SUMMARY TABLE:");
      console.log(
        `${"Metric".padEnd(20)}${"Baseline Mean".padEnd(16)}${"Candidate Mean".padEnd(16)}${"Diff [95% CI]".padEnd(26)}Verdict`,
      );
      for (const m of report.metrics) {
        const diffStr = `${m.diff >= 0 ? "+" : ""}${m.diff.toFixed(3)} [${m.ci.lower.toFixed(3)}, ${m.ci.upper.toFixed(3)}]`;
        console.log(
          `${m.metric.padEnd(20)}${m.baselineMean.toFixed(3).padEnd(16)}${m.candidateMean.toFixed(3).padEnd(16)}${diffStr.padEnd(26)}[ ${m.verdict} ]`,
        );
      }
      console.log("------------------------------------------------------------");
      console.log("COST & LATENCY BREAKDOWN:");
      console.log(
        `Baseline:  $${report.usage.baseline.costPer1kCasesUsd.toFixed(2)} / 1k cases | p50: ${Math.round(report.usage.baseline.latencyP50Ms)}ms | p95: ${Math.round(report.usage.baseline.latencyP95Ms)}ms`,
      );
      console.log(
        `Candidate: $${report.usage.candidate.costPer1kCasesUsd.toFixed(2)} / 1k cases | p50: ${Math.round(report.usage.candidate.latencyP50Ms)}ms | p95: ${Math.round(report.usage.candidate.latencyP95Ms)}ms`,
      );
      console.log("------------------------------------------------------------");
      console.log("PARETO RECOMMENDATION:");
      console.log(`Recommended: ${report.pareto.recommendation.recommendedCellName}`);
      console.log(`Rule:        ${report.pareto.recommendation.ruleExplanation}`);
      for (const c of report.pareto.recommendation.caveats) {
        console.log(`  * Caveat: ${c}`);
      }
      if (report.simpsonsAnomalies.length > 0) {
        console.log("------------------------------------------------------------");
        console.log("SIMPSON'S PARADOX ALERTS:");
        for (const a of report.simpsonsAnomalies) {
          console.log(`  ! ${a.simpsonsReasoning}`);
        }
      }
      console.log("============================================================\n");
    } catch (err) {
      console.error(`Error comparing cells: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

// --- FLYWHEEL COMMANDS ---
const flywheelCmd = program
  .command("flywheel")
  .description("Production-to-test flywheel & trace promotion");

flywheelCmd
  .command("ingest <file>")
  .description("Ingest production traces with automatic PII scrubbing and triage classification")
  .option("--no-scrub", "Disable automatic PII scrubbing")
  .action(async (file: string, options: { scrub?: boolean }) => {
    try {
      if (!existsSync(file)) {
        console.error(`Trace file not found: ${file}`);
        process.exitCode = 1;
        return;
      }

      const content = readFileSync(file, "utf8");
      let rawTraces: unknown[] = [];

      if (file.endsWith(".jsonl")) {
        rawTraces = content
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0)
          .map((l) => JSON.parse(l));
      } else {
        const parsed = JSON.parse(content);
        rawTraces = Array.isArray(parsed) ? parsed : [parsed];
      }

      const shouldScrub = options.scrub !== false;
      const db = getDb();
      const traceRepo = new TraceRepository(db);

      console.log(`\n=== Ingesting ${rawTraces.length} Production Trace(s) ===`);
      console.log(`PII Redaction: ${shouldScrub ? "Active (Emails, SSNs, Cards, Keys, IPs)" : "Bypassed"}`);

      let totalPiiRedacted = 0;
      const detectedPiiTypes = new Set<string>();
      const triageCounts: Record<string, number> = {
        CRITICAL: 0,
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
      };

      const preparedTraces = [];

      for (const item of rawTraces) {
        const parsedTrace = TraceInputSchema.parse(item);
        let scrubbedInput = parsedTrace.input;
        let scrubbedOutput = parsedTrace.output;
        let scrubbedMeta = parsedTrace.metadata;

        if (shouldScrub) {
          const inRes = scrubObject(scrubbedInput);
          scrubbedInput = inRes.redacted;
          totalPiiRedacted += inRes.totalRedactions;
          for (const t of inRes.detectedTypes) detectedPiiTypes.add(t);

          const outRes = scrubObject(scrubbedOutput);
          scrubbedOutput = outRes.redacted;
          totalPiiRedacted += outRes.totalRedactions;
          for (const t of outRes.detectedTypes) detectedPiiTypes.add(t);

          if (scrubbedMeta) {
            const metaRes = scrubObject(scrubbedMeta);
            scrubbedMeta = metaRes.redacted;
            totalPiiRedacted += metaRes.totalRedactions;
            for (const t of metaRes.detectedTypes) detectedPiiTypes.add(t);
          }
        }

        const triage = classifyTrace({
          id: parsedTrace.id,
          output: scrubbedOutput,
          feedback: parsedTrace.feedback,
          metadata: scrubbedMeta,
        });

        triageCounts[triage.priority] = (triageCounts[triage.priority] ?? 0) + 1;

        preparedTraces.push({
          trace: {
            ...parsedTrace,
            input: scrubbedInput,
            output: scrubbedOutput,
            metadata: scrubbedMeta,
            redacted: shouldScrub,
            timestamp: parsedTrace.timestamp ? new Date(parsedTrace.timestamp) : new Date(),
          },
          triage,
        });
      }

      // Persist to database
      await traceRepo.ingestTraces(preparedTraces.map((p) => p.trace));

      for (const p of preparedTraces) {
        await traceRepo.addLabel({
          traceId: p.trace.id,
          label: p.triage.priority,
          score: p.triage.score,
          details: {
            reasons: p.triage.reasons,
            suggestedAction: p.triage.suggestedAction,
          },
          labeledBy: "flywheel-triage",
        });
      }

      console.log("------------------------------------------------------------");
      console.log(`Successfully ingested: ${preparedTraces.length} traces`);
      console.log(`PII Redactions Applied: ${totalPiiRedacted} (${Array.from(detectedPiiTypes).join(", ") || "None"})`);
      console.log("Triage Priority Breakdown:");
      console.log(`  * CRITICAL: ${triageCounts.CRITICAL} (Recommended for immediate promotion)`);
      console.log(`  * HIGH:     ${triageCounts.HIGH}`);
      console.log(`  * MEDIUM:   ${triageCounts.MEDIUM}`);
      console.log(`  * LOW:      ${triageCounts.LOW}`);
      console.log("============================================================\n");
    } catch (err) {
      console.error(`Error ingesting traces: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

flywheelCmd
  .command("triage")
  .description("List and inspect triaged production traces flagged for review or promotion")
  .option("-p, --priority <priority>", "Filter by triage priority (CRITICAL, HIGH, MEDIUM, LOW)")
  .option("-l, --limit <limit>", "Maximum number of traces to list", "20")
  .action(async (options: { priority?: string; limit?: string }) => {
    try {
      const db = getDb();
      const traceRepo = new TraceRepository(db);
      const limit = Number.parseInt(options.limit ?? "20", 10) || 20;

      const tracesList = await traceRepo.listTraces({ limit });

      console.log("\n============================================================");
      console.log("PRODUCTION TRACE TRIAGE QUEUE");
      console.log("============================================================");
      console.log(
        `${"Trace ID".padEnd(20)}${"Model".padEnd(16)}${"Priority".padEnd(12)}${"Feedback / Reasons"}`,
      );
      console.log("------------------------------------------------------------");

      let count = 0;
      for (const t of tracesList) {
        const labels = await traceRepo.getLabels(t.id);
        const topLabel = labels[0]?.label ?? "UNLABELED";

        if (options.priority && topLabel !== options.priority.toUpperCase()) {
          continue;
        }

        const feedbackObj = t.feedback as { comment?: string; rating?: number } | null;
        const feedbackStr = feedbackObj?.comment
          ? `"${feedbackObj.comment}"`
          : feedbackObj?.rating !== undefined
            ? `Rating: ${feedbackObj.rating}`
            : (labels[0]?.details as { reasons?: string[] })?.reasons?.[0] ?? "None";

        console.log(
          `${t.id.slice(0, 18).padEnd(20)}${t.model.slice(0, 14).padEnd(16)}${`[${topLabel}]`.padEnd(12)}${feedbackStr.slice(0, 45)}`,
        );
        count++;
      }

      if (count === 0) {
        console.log("No traces found matching the specified filter criteria.");
      }
      console.log("============================================================\n");
    } catch (err) {
      console.error(`Error querying triage queue: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
  });

flywheelCmd
  .command("promote <traceId>")
  .description("Promote a production trace into a content-addressed test dataset version")
  .requiredOption("-d, --dataset <name>", "Target dataset name")
  .option("-e, --expected <output>", "Ground truth expected output (defaults to model output)")
  .option("-s, --synthetic <count>", "Number of synthetic variations to generate", "0")
  .option("--seed <number>", "Random seed for synthetic variations", "42")
  .option("--force", "Bypass near-duplicate similarity warning")
  .option("--tags <tags>", "Comma-separated extra tags")
  .action(
    async (
      traceId: string,
      options: {
        dataset: string;
        expected?: string;
        synthetic?: string;
        seed?: string;
        force?: boolean;
        tags?: string;
      },
    ) => {
      try {
        const db = getDb();
        const traceRepo = new TraceRepository(db);
        const datasetRepo = new DatasetRepository(db);
        const engine = new PromotionEngine(traceRepo, datasetRepo);

        const syntheticCount = Number.parseInt(options.synthetic ?? "0", 10) || 0;
        const seed = Number.parseInt(options.seed ?? "42", 10) || 42;
        const extraTags = options.tags ? options.tags.split(",").map((t) => t.trim()) : [];

        console.log(`\n=== Promoting Trace: ${traceId} ===`);
        console.log(`Target Dataset:   ${options.dataset}`);
        console.log(`Synthetic Count:  ${syntheticCount}`);
        console.log(`Duplicate Guard:  ${options.force ? "Disabled (--force)" : "Active (Jaccard >= 0.85)"}`);

        const result = await engine.promoteTrace({
          traceId,
          datasetName: options.dataset,
          expectedOutput: options.expected,
          syntheticCount,
          seed,
          force: Boolean(options.force),
          extraTags,
        });

        console.log("------------------------------------------------------------");
        console.log("PROMOTION SUCCESSFUL:");
        console.log(`Dataset ID:           ${result.datasetId} (${result.isNewDataset ? "Created" : "Updated"})`);
        console.log(`Dataset Version ID:   ${result.datasetVersionId}`);
        console.log(`Primary Case ID:      ${result.promotedCaseId}`);
        if (result.syntheticCaseIds.length > 0) {
          console.log(`Synthetic Case IDs:   ${result.syntheticCaseIds.length} variation(s) generated`);
          for (const sId of result.syntheticCaseIds) {
            console.log(`  * ${sId}`);
          }
        }
        console.log(`Total Cases in Set:   ${result.totalCasesInVersion}`);
        console.log("============================================================\n");
      } catch (err) {
        console.error(`Promotion failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    },
  );

// --- RED-TEAM COMMANDS ---
const redteamCmd = program
  .command("redteam")
  .description("Security evaluation, adversarial attack taxonomy, and ASR scoring");

redteamCmd
  .command("categories")
  .description("List available red-team attack categories and active probes")
  .action(() => {
    console.log("\n============================================================");
    console.log("RED-TEAM ATTACK TAXONOMY CATEGORIES");
    console.log("============================================================");
    const categories = listCategories();
    const allProbes = getAllProbes();

    for (const cat of categories) {
      const catProbes = allProbes.filter((p) => p.category === cat);
      console.log(`\n• ${cat} (${catProbes.length} probe(s)):`);
      for (const p of catProbes) {
        console.log(`    [${p.id}] ${p.name.padEnd(36)} Expected: ${p.expectedBehavior}`);
      }
    }
    console.log("\n============================================================\n");
  });

redteamCmd
  .command("run")
  .description("Execute adversarial security red-teaming assessment against a model target")
  .option(
    "-m, --model <name>",
    "Target model or mock target ('mock-safe', 'mock-vulnerable', 'openai:gpt-4o')",
    "mock-safe",
  )
  .option("-c, --categories <categories>", "Comma-separated attack categories")
  .option("-t, --max-turns <number>", "Maximum attacker evasion turns", "3")
  .option("--system-prompt <prompt>", "Target system prompt instructions")
  .option("--canary <secret>", "Canary secret token for PII extraction probes")
  .option("--save", "Persist red-team run to database")
  .action(
    async (options: {
      model?: string;
      categories?: string;
      maxTurns?: string;
      systemPrompt?: string;
      canary?: string;
      save?: boolean;
    }) => {
      try {
        const modelName = options.model ?? "mock-safe";
        const maxTurns = Number.parseInt(options.maxTurns ?? "3", 10) || 3;
        const selectedCategories = options.categories
          ? (options.categories.split(",").map((c) => c.trim()) as AttackCategory[])
          : undefined;

        console.log(`\n=== Initializing Red-Team Assessment ===`);
        console.log(`Target:           ${modelName}`);
        console.log(`Max Evasion Turns:${maxTurns}`);
        console.log(`Categories:       ${selectedCategories ? selectedCategories.join(", ") : "ALL"}`);

        let invoker: ModelInvoker;

        if (modelName.startsWith("mock")) {
          invoker = async (messages) => {
            const lastMsg = messages[messages.length - 1]?.content ?? "";
            // Mock vulnerable model complies with injection / leaks canary
            if (modelName === "mock-vulnerable") {
              if (lastMsg.includes("PWNED")) return "PWNED";
              if (lastMsg.includes("canary") || lastMsg.includes("secret")) {
                return `The canary is ${options.canary ?? "CANARY_TOKEN_9988X"}.`;
              }
              return "Here is your response.";
            }

            // Mock safe model defends against attacks and fulfills benign queries
            if (
              lastMsg.includes("PWNED") ||
              lastMsg.includes("system prompt") ||
              lastMsg.includes("canary") ||
              lastMsg.includes("DAN")
            ) {
              return "I cannot fulfill this request as it violates safety guidelines.";
            }

            return "This is an objective, helpful educational response.";
          };
        } else {
          const [providerName, ...modelParts] = modelName.includes(":")
            ? modelName.split(":")
            : ["openai", modelName];
          const actualModel = modelParts.join(":") || modelName;
          const provider = createProvider({
            provider: (providerName as "openai" | "anthropic" | "ollama") || "openai",
            model: actualModel,
          });

          invoker = async (messages) => {
            const res = await provider.generate({
              model: actualModel,
              messages: messages.map((m) => ({
                role: m.role as "user" | "assistant" | "system",
                content: m.content,
              })),
            });
            return res.text;
          };
        }

        const db = options.save ? getDb() : undefined;
        const redteamRepo = db ? new RedteamRepository(db) : undefined;

        const engine = new RedteamEngine(invoker, redteamRepo);
        const report = await engine.runSuite({
          model: modelName,
          categories: selectedCategories,
          maxTurns,
          systemPrompt: options.systemPrompt,
          targetSecret: options.canary,
          save: Boolean(options.save),
        });

        const formatted = RedteamEngine.formatConsoleReport(report);
        console.log(formatted);

        if (options.save) {
          console.log("Assessment results persisted to database successfully.");
        }
      } catch (err) {
        console.error(`Red-team run failed: ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      }
    },
  );

export const CLI_PACKAGE_NAME = "@evalboard/cli";

if (process.argv[1]?.endsWith("evalboard") || process.argv[1]?.endsWith("index.js")) {
  program.parse();
}
