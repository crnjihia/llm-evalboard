import { checkRequestAuth } from "@/lib/auth";
import { compareCells } from "@evalboard/core";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const CompareQuerySchema = z.object({
  runId: z.string().optional(),
  delta: z.coerce.number().default(0.03),
  seed: z.coerce.number().default(42),
});

export async function GET(request: NextRequest) {
  if (!checkRequestAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing API token" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = CompareQuerySchema.safeParse(Object.fromEntries(searchParams.entries()));

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { delta, seed } = parsed.data;

  // Generate comparison report from sample mock cases
  const sampleCases = [
    {
      caseId: "c1",
      input: { text: "JSON format sample query" },
      tags: ["json"],
      baselineRuns: [{ score: 0.85, pass: true, latencyMs: 250, costUsd: 0.001 }],
      candidateRuns: [{ score: 0.95, pass: true, latencyMs: 180, costUsd: 0.0006 }],
    },
    {
      caseId: "c2",
      input: { text: "Conciseness query" },
      tags: ["concise"],
      baselineRuns: [{ score: 0.9, pass: true, latencyMs: 300, costUsd: 0.0012 }],
      candidateRuns: [{ score: 0.8, pass: false, latencyMs: 220, costUsd: 0.0007 }],
    },
  ];

  const report = compareCells(
    {
      runId: parsed.data.runId ?? "sample-run-101",
      baselineCell: { id: "cell-b", name: "Claude 3.5 Haiku" },
      candidateCell: { id: "cell-c", name: "Llama 3.3 70B" },
      cases: sampleCases,
    },
    { delta, seed },
  );

  return NextResponse.json(report);
}
