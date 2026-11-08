import type { CaseInput, DatasetRepository, TraceRepository } from "@evalboard/db";
import { isDuplicate } from "./dedup.js";
import { scrubObject } from "./redaction.js";
import { generateSyntheticVariations } from "./synthetic.js";
import type { PromotionOptions, PromotionResult } from "./types.js";

export class DuplicateCaseError extends Error {
  constructor(
    message: string,
    public readonly similarity: number,
    public readonly matchedCase?: string,
  ) {
    super(message);
    this.name = "DuplicateCaseError";
  }
}

export class TraceNotFoundError extends Error {
  constructor(traceId: string) {
    super(`Trace with ID '${traceId}' not found.`);
    this.name = "TraceNotFoundError";
  }
}

export class PromotionEngine {
  constructor(
    private readonly traceRepo: TraceRepository,
    private readonly datasetRepo: DatasetRepository,
  ) {}

  async promoteTrace(options: PromotionOptions): Promise<PromotionResult> {
    const trace = await this.traceRepo.getTrace(options.traceId);
    if (!trace) {
      throw new TraceNotFoundError(options.traceId);
    }

    // 1. Scrub PII if not already redacted
    let scrubbedInput = trace.input as Record<string, unknown>;
    let scrubbedOutput = trace.output;

    if (!trace.redacted) {
      const inputRedaction = scrubObject(scrubbedInput);
      scrubbedInput = inputRedaction.redacted;
      const outputRedaction = scrubObject(scrubbedOutput);
      scrubbedOutput = outputRedaction.redacted;
    }

    // 2. Fetch or create the target dataset
    const dataset = await this.datasetRepo.getOrCreateDataset({
      name: options.datasetName,
      projectId: options.projectId ?? trace.projectId ?? undefined,
      description: options.datasetDescription ?? "Dataset created/updated via Trace Promotion",
    });

    const isNewDataset = !dataset.createdAt || Date.now() - dataset.createdAt.getTime() < 2000;

    // 3. Optional Deduplication Check against existing dataset cases
    const dedupThreshold = options.dedupThreshold ?? 0.85;
    if (!options.force) {
      // Serialize candidate text representation
      const candidateString =
        typeof scrubbedInput.query === "string"
          ? scrubbedInput.query
          : typeof scrubbedInput.prompt === "string"
            ? scrubbedInput.prompt
            : JSON.stringify(scrubbedInput);

      // We can check if any cases in previous version had identical or near-identical text
      const previousVersion = await this.datasetRepo.getLatestVersion(dataset.id);
      if (previousVersion && previousVersion.caseCount > 0) {
        const existingCases = await this.datasetRepo.getCases(previousVersion.id);
        const existingTexts = existingCases.map((c) =>
          typeof (c.input as Record<string, unknown>).query === "string"
            ? (c.input as Record<string, unknown>).query
            : typeof (c.input as Record<string, unknown>).prompt === "string"
              ? (c.input as Record<string, unknown>).prompt
              : JSON.stringify(c.input),
        ) as string[];

        const dedupResult = isDuplicate(candidateString, existingTexts, dedupThreshold);
        if (dedupResult.isDuplicate) {
          throw new DuplicateCaseError(
            `Candidate trace is a near-duplicate of an existing case in dataset '${options.datasetName}' (Jaccard similarity: ${(dedupResult.maxSimilarity * 100).toFixed(1)}%). Use --force to override.`,
            dedupResult.maxSimilarity,
            dedupResult.matchedText,
          );
        }
      }
    }

    // 4. Construct the canonical primary test case
    const primaryCase: CaseInput = {
      input: scrubbedInput,
      expected: options.expectedOutput
        ? { output: options.expectedOutput }
        : scrubbedOutput
          ? { output: scrubbedOutput }
          : undefined,
      metadata: {
        promotedFromTrace: trace.id,
        promotedAt: new Date().toISOString(),
        model: trace.model,
        feedback: trace.feedback,
        originalMetadata: trace.metadata,
      },
      tags: ["promoted-trace", ...(options.extraTags ?? [])],
    };

    const casesToInsert: CaseInput[] = [primaryCase];

    // 5. Generate synthetic variations if requested
    const syntheticCount = options.syntheticCount ?? 0;
    if (syntheticCount > 0) {
      const variations = generateSyntheticVariations(
        scrubbedInput,
        syntheticCount,
        options.seed ?? 42,
      );

      for (const v of variations) {
        casesToInsert.push({
          input: v.input,
          expected: primaryCase.expected,
          metadata: {
            promotedFromTrace: trace.id,
            syntheticOf: trace.id,
            perturbationType: v.perturbationType,
            variationIndex: v.variationIndex,
            promotedAt: new Date().toISOString(),
          },
          tags: ["promoted-trace", "synthetic", ...(options.extraTags ?? [])],
        });
      }
    }

    // 6. Append to existing cases if updating an existing version
    const latestVersion = await this.datasetRepo.getLatestVersion(dataset.id);
    let allCases: CaseInput[] = casesToInsert;

    if (latestVersion && latestVersion.caseCount > 0) {
      const priorCases = await this.datasetRepo.getCases(latestVersion.id);
      const convertedPriorCases: CaseInput[] = priorCases.map((c) => ({
        input: c.input as Record<string, unknown>,
        expected: c.expected as Record<string, unknown> | undefined,
        metadata: (c.metadata as Record<string, unknown>) ?? {},
        tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
      }));

      // Combine existing and new cases
      allCases = [...convertedPriorCases, ...casesToInsert];
    }

    // 7. Deterministically create new content-addressed dataset version
    const { version } = await this.datasetRepo.createVersion({
      datasetId: dataset.id,
      cases: allCases,
    });

    // 8. Log promotion label on the trace
    await this.traceRepo.addLabel({
      traceId: trace.id,
      label: "PROMOTED",
      score: 1.0,
      details: {
        datasetId: dataset.id,
        datasetName: dataset.name,
        versionId: version.id,
        syntheticCount,
      },
      labeledBy: "flywheel-promotion",
    });

    // The primary promoted case ID and synthetic case IDs
    const createdCases = await this.datasetRepo.getCases(version.id);
    const primaryCaseRow = createdCases.find(
      (c) => (c.metadata as Record<string, unknown>)?.promotedFromTrace === trace.id,
    );
    const syntheticCaseRows = createdCases.filter(
      (c) =>
        (c.metadata as Record<string, unknown>)?.syntheticOf === trace.id &&
        (c.metadata as Record<string, unknown>)?.promotedFromTrace === trace.id,
    );

    return {
      datasetId: dataset.id,
      datasetVersionId: version.id,
      promotedCaseId: primaryCaseRow?.id ?? "unknown",
      syntheticCaseIds: syntheticCaseRows.map((c) => c.id),
      isNewDataset,
      totalCasesInVersion: version.caseCount,
    };
  }
}
