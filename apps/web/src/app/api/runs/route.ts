import { checkRequestAuth } from "@/lib/auth";
import { type NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  if (!checkRequestAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sampleRuns = [
    {
      id: "run-e8f2a1b9-3c4d-4e5f",
      suiteName: "Customer Support Prompt Optimization",
      status: "completed",
      createdAt: new Date().toISOString(),
      casesCount: 100,
      repeats: 3,
      totalCostUsd: 0.193,
    },
    {
      id: "run-c149b8a2-11a3-48ef",
      suiteName: "Financial Advisory Compliance Benchmark",
      status: "completed",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      casesCount: 60,
      repeats: 1,
      totalCostUsd: 0.342,
    },
  ];

  return NextResponse.json({ runs: sampleRuns });
}
