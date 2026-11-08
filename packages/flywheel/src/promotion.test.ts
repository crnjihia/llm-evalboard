import type { CaseInput, DatasetRepository, TraceRepository } from "@evalboard/db";
import { describe, expect, it, vi } from "vitest";
import { DuplicateCaseError, PromotionEngine, TraceNotFoundError } from "./promotion.js";

describe("Promotion Engine", () => {
  const mockTrace = {
    id: "trace-abc-123",
    projectId: "00000000-0000-0000-0000-000000000001",
    timestamp: new Date("2026-11-08T00:00:00.000Z"),
    input: {
      query: "Alice from New York wants to cancel order #987.",
      email: "alice@example.com",
    },
    output: "I have cancelled order #987 for user alice@example.com.",
    model: "claude-3-5-haiku",
    metadata: { env: "production", latencyMs: 450 },
    feedback: { rating: -1, comment: "Did not ask for confirmation" },
    redacted: false,
    createdAt: new Date(),
  };

  const mockDataset = {
    id: "dataset-001",
    projectId: "00000000-0000-0000-0000-000000000001",
    name: "production-cancellations",
    description: "Production edge cases",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVersion = {
    id: "v_1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    datasetId: "dataset-001",
    caseCount: 1,
    caseHashes: ["case-001"],
    createdAt: new Date(),
  };

  function createMockRepos() {
    const traceRepo = {
      getTrace: vi.fn().mockResolvedValue(mockTrace),
      addLabel: vi.fn().mockResolvedValue({ id: "label-001" }),
      ingestTraces: vi.fn(),
      listTraces: vi.fn(),
      getLabels: vi.fn(),
    } as unknown as TraceRepository;

    const datasetRepo = {
      getOrCreateDataset: vi.fn().mockResolvedValue(mockDataset),
      getLatestVersion: vi.fn().mockResolvedValue(null),
      createVersion: vi.fn().mockResolvedValue({ version: mockVersion, isNew: true }),
      getCases: vi.fn().mockResolvedValue([
        {
          id: "case-001",
          datasetVersionId: mockVersion.id,
          caseIndex: 0,
          input: mockTrace.input,
          expected: { output: mockTrace.output },
          metadata: { promotedFromTrace: mockTrace.id },
          tags: ["promoted-trace"],
          split: "test",
        },
      ]),
      getVersion: vi.fn(),
    } as unknown as DatasetRepository;

    return { traceRepo, datasetRepo };
  }

  it("throws TraceNotFoundError if trace does not exist", async () => {
    const { traceRepo, datasetRepo } = createMockRepos();
    vi.mocked(traceRepo.getTrace).mockResolvedValueOnce(null);

    const engine = new PromotionEngine(traceRepo, datasetRepo);

    await expect(
      engine.promoteTrace({
        traceId: "non-existent-id",
        datasetName: "test-dataset",
      }),
    ).rejects.toThrow(TraceNotFoundError);
  });

  it("scrubs PII on input and output when promoting unredacted trace", async () => {
    const { traceRepo, datasetRepo } = createMockRepos();
    const engine = new PromotionEngine(traceRepo, datasetRepo);

    await engine.promoteTrace({
      traceId: mockTrace.id,
      datasetName: "production-cancellations",
    });

    expect(datasetRepo.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId: mockDataset.id,
        cases: expect.arrayContaining([
          expect.objectContaining({
            input: expect.objectContaining({
              email: "[EMAIL]",
            }),
            expected: expect.objectContaining({
              output: expect.stringContaining("[EMAIL]"),
            }),
            tags: expect.arrayContaining(["promoted-trace"]),
          }),
        ]),
      }),
    );
  });

  it("attaches synthetic variations when syntheticCount > 0", async () => {
    const { traceRepo, datasetRepo } = createMockRepos();
    const engine = new PromotionEngine(traceRepo, datasetRepo);

    await engine.promoteTrace({
      traceId: mockTrace.id,
      datasetName: "production-cancellations",
      syntheticCount: 2,
      seed: 42,
    });

    const createVersionCall = vi.mocked(datasetRepo.createVersion).mock.calls[0]?.[0];
    expect(createVersionCall?.cases.length).toBe(3); // 1 primary + 2 synthetic

    const syntheticCases = createVersionCall?.cases.filter((c: CaseInput) =>
      c.tags?.includes("synthetic"),
    );
    expect(syntheticCases?.length).toBe(2);
    expect(syntheticCases?.[0]?.metadata?.syntheticOf).toBe(mockTrace.id);
  });

  it("guards against near-duplicates unless force is specified", async () => {
    const { traceRepo, datasetRepo } = createMockRepos();

    // Mock existing version containing identical query
    vi.mocked(datasetRepo.getLatestVersion).mockResolvedValueOnce({
      ...mockVersion,
      caseCount: 1,
    });
    vi.mocked(datasetRepo.getCases).mockResolvedValueOnce([
      {
        id: "existing-case-001",
        datasetVersionId: mockVersion.id,
        caseIndex: 0,
        input: { query: "Alice from New York wants to cancel order #987." },
        expected: null,
        metadata: {},
        tags: [],
        split: "test",
        createdAt: new Date(),
      },
    ]);

    const engine = new PromotionEngine(traceRepo, datasetRepo);

    await expect(
      engine.promoteTrace({
        traceId: mockTrace.id,
        datasetName: "production-cancellations",
        force: false,
      }),
    ).rejects.toThrow(DuplicateCaseError);

    // With force: true, duplicate is allowed
    const result = await engine.promoteTrace({
      traceId: mockTrace.id,
      datasetName: "production-cancellations",
      force: true,
    });

    expect(result.datasetId).toBe(mockDataset.id);
  });

  it("records PROMOTED label on the trace upon successful promotion", async () => {
    const { traceRepo, datasetRepo } = createMockRepos();
    const engine = new PromotionEngine(traceRepo, datasetRepo);

    await engine.promoteTrace({
      traceId: mockTrace.id,
      datasetName: "production-cancellations",
    });

    expect(traceRepo.addLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        traceId: mockTrace.id,
        label: "PROMOTED",
        score: 1.0,
      }),
    );
  });
});
