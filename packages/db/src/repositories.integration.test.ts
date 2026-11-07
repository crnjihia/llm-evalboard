import { beforeAll, describe, expect, it } from "vitest";
import { createDbClient } from "./client.js";
import {
  ComparisonRepository,
  DatasetRepository,
  GraderRepository,
  PromptRepository,
  RunRepository,
} from "./repositories/index.js";

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5435/evalboard";

describe(
  "database repositories and immutability (Phase 1 Acceptance Criteria)",
  { timeout: 20000 },
  () => {
    let db: ReturnType<typeof createDbClient>;
    let promptRepo: PromptRepository;
    let datasetRepo: DatasetRepository;
    let graderRepo: GraderRepository;
    let runRepo: RunRepository;
    let comparisonRepo: ComparisonRepository;

    beforeAll(() => {
      db = createDbClient(DATABASE_URL);
      promptRepo = new PromptRepository(db);
      datasetRepo = new DatasetRepository(db);
      graderRepo = new GraderRepository(db);
      runRepo = new RunRepository(db);
      comparisonRepo = new ComparisonRepository(db);
    });

    it("re-importing identical prompt content yields the same version ID and creates no duplicates", async () => {
      const nonce = `${Date.now()}-${Math.random()}`;
      const prompt = await promptRepo.getOrCreatePrompt({
        name: `prompt-test-${nonce}`,
        description: "Prompt for idempotency test",
      });

      const templateContent = `Answer the user question (${nonce}): {{query}}`;
      const variablesSchema = { query: "string" };

      // First import
      const res1 = await promptRepo.createVersion({
        promptId: prompt.id,
        template: templateContent,
        variablesSchema,
      });

      expect(res1.isNew).toBe(true);
      expect(res1.version.id).toHaveLength(64);

      // Second import with identical content
      const res2 = await promptRepo.createVersion({
        promptId: prompt.id,
        template: templateContent,
        variablesSchema,
      });

      expect(res2.isNew).toBe(false);
      expect(res2.version.id).toBe(res1.version.id);

      // Verify only one version exists in DB
      const allVersions = await promptRepo.listVersions(prompt.id);
      expect(allVersions).toHaveLength(1);
      expect(allVersions[0]?.id).toBe(res1.version.id);
    });

    it("editing a prompt creates a new version while old runs still reference the old version", async () => {
      const nonce = `${Date.now()}-${Math.random()}`;
      const prompt = await promptRepo.getOrCreatePrompt({
        name: `prompt-mutation-${nonce}`,
      });

      // Version 1
      const v1 = await promptRepo.createVersion({
        promptId: prompt.id,
        template: `Version 1 template (${nonce})`,
      });

      // Create a mock dataset & grader version to associate with a run
      const dataset = await datasetRepo.getOrCreateDataset({
        name: `dataset-run-${nonce}`,
      });
      const dsVersion = await datasetRepo.createVersion({
        datasetId: dataset.id,
        cases: [{ input: { q: `test-${nonce}` } }],
      });
      const graderVersion = await graderRepo.createVersion({
        type: "exact",
        config: { trim: true, nonce },
      });

      // Create a run referencing v1
      const { run, cells } = await runRepo.createRun({
        suiteName: "reproducibility-suite",
        configHash: `hash-${nonce}`.padEnd(64, "0").slice(0, 64),
        resolvedConfig: { prompt: `Version 1 (${nonce})` },
        datasetVersionId: dsVersion.version.id,
        promptVersionIds: [v1.version.id],
        models: [{ provider: "mock", model: "mock-v1" }],
        graderVersionIds: [graderVersion.version.id],
        cells: [
          {
            promptVersionId: v1.version.id,
            modelConfig: { provider: "mock", model: "mock-v1" },
            isBaseline: true,
          },
        ],
      });

      expect(run.promptVersionIds).toContain(v1.version.id);
      expect(cells[0]?.promptVersionId).toBe(v1.version.id);

      // Edit the prompt -> creates Version 2
      const v2 = await promptRepo.createVersion({
        promptId: prompt.id,
        template: `Version 2 edited template with new instruction (${nonce})`,
      });

      expect(v2.isNew).toBe(true);
      expect(v2.version.id).not.toBe(v1.version.id);

      // Verify old run STILL points to v1 and v1 still exists unchanged
      const fetchedRun = await runRepo.getRun(run.id);
      expect(fetchedRun?.cells[0]?.promptVersionId).toBe(v1.version.id);

      const oldVersionInDb = await promptRepo.getVersion(v1.version.id);
      expect(oldVersionInDb?.template).toBe(`Version 1 template (${nonce})`);
    });

    it("re-importing identical dataset content yields the same version ID and creates no duplicates", async () => {
      const nonce = `${Date.now()}-${Math.random()}`;
      const dataset = await datasetRepo.getOrCreateDataset({
        name: `dataset-idempotency-${nonce}`,
      });

      const cases = [
        { input: { x: 1, nonce }, expected: 2, tags: ["calc"] },
        { input: { x: 2, nonce }, expected: 4, tags: ["calc"] },
      ];

      const v1 = await datasetRepo.createVersion({
        datasetId: dataset.id,
        cases,
      });

      expect(v1.isNew).toBe(true);
      expect(v1.version.caseCount).toBe(2);

      // Re-importing identical cases
      const v2 = await datasetRepo.createVersion({
        datasetId: dataset.id,
        cases,
      });

      expect(v2.isNew).toBe(false);
      expect(v2.version.id).toBe(v1.version.id);

      // Cases can be retrieved in order
      const storedCases = await datasetRepo.getCases(v1.version.id);
      expect(storedCases).toHaveLength(2);
      expect(storedCases[0]?.caseIndex).toBe(0);
      expect(storedCases[1]?.caseIndex).toBe(1);
    });

    it("records case results, grader results, and comparisons transactionally", async () => {
      const dataset = await datasetRepo.getOrCreateDataset({
        name: `eval-dataset-${Date.now()}`,
      });
      const dsVer = await datasetRepo.createVersion({
        datasetId: dataset.id,
        cases: [{ input: { prompt: "hi" } }],
      });
      const prompt = await promptRepo.getOrCreatePrompt({
        name: `eval-prompt-${Date.now()}`,
      });
      const pVer = await promptRepo.createVersion({
        promptId: prompt.id,
        template: "Hello",
      });
      const gVer = await graderRepo.createVersion({
        type: "exact",
        config: { match: "Hello" },
      });

      const { run, cells } = await runRepo.createRun({
        suiteName: "run-transaction-test",
        configHash: "cfghash".padEnd(64, "1"),
        resolvedConfig: { test: true },
        datasetVersionId: dsVer.version.id,
        promptVersionIds: [pVer.version.id],
        models: [{ provider: "mock", model: "model-a" }],
        graderVersionIds: [gVer.version.id],
        cells: [
          {
            promptVersionId: pVer.version.id,
            modelConfig: { provider: "mock", model: "model-a" },
          },
        ],
      });

      const cell = cells[0];
      expect(cell).toBeDefined();
      if (!cell) throw new Error("Expected at least one cell");

      const cases = await datasetRepo.getCases(dsVer.version.id);
      const targetCase = cases[0];
      expect(targetCase).toBeDefined();
      if (!targetCase) throw new Error("Expected at least one case");

      const { caseResult, graderResults } = await runRepo.recordCaseResult({
        runCellId: cell.id,
        caseId: targetCase.id,
        repeatIndex: 0,
        output: "Hello",
        latencyMs: 120,
        usage: { inputTokens: 5, outputTokens: 2, totalTokens: 7, costUsd: 0.0001 },
        graders: [
          {
            graderVersionId: gVer.version.id,
            score: 1.0,
            pass: true,
            reason: "Exact match satisfied",
          },
        ],
      });

      expect(caseResult.id).toBeDefined();
      expect(graderResults).toHaveLength(1);
      expect(graderResults[0]?.score).toBe(1.0);
      expect(graderResults[0]?.pass).toBe(true);

      // Save a comparison
      const comparison = await comparisonRepo.saveComparison({
        runId: run.id,
        baselineCellId: cell.id,
        candidateCellId: cell.id,
        metric: "exact_match",
        baselineMean: 1.0,
        candidateMean: 1.0,
        diff: 0.0,
        ciLower: -0.01,
        ciUpper: 0.01,
        verdict: "NO_MEANINGFUL_DIFFERENCE",
        nPairs: 1,
      });

      expect(comparison.verdict).toBe("NO_MEANINGFUL_DIFFERENCE");

      const retrieved = await comparisonRepo.getComparisonsByRun(run.id);
      expect(retrieved).toHaveLength(1);
      expect(retrieved[0]?.metric).toBe("exact_match");
    });
  },
);
