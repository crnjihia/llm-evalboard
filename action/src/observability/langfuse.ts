import type { LangfuseTracePayload } from "../types.js";

export interface LangfuseExportOptions {
  host?: string;
  publicKey?: string;
  secretKey?: string;
}

/**
 * Transforms an Evalboard case run into a Langfuse ingestion payload.
 */
export function createLangfuseTracePayload(input: {
  suiteName: string;
  caseId: string;
  model: string;
  inputContent: unknown;
  outputContent: unknown;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  score?: number;
  reason?: string;
}): LangfuseTracePayload {
  const traceId = `tr-${input.caseId.slice(0, 16)}`;

  return {
    id: traceId,
    name: `evalboard-${input.suiteName}`,
    metadata: {
      suite: input.suiteName,
      caseId: input.caseId,
    },
    generation: {
      name: `generation-${input.model}`,
      model: input.model,
      input: input.inputContent,
      output: input.outputContent,
      latencyMs: input.latencyMs,
      usage: {
        promptTokens: input.inputTokens,
        completionTokens: input.outputTokens,
        totalTokens: (input.inputTokens ?? 0) + (input.outputTokens ?? 0),
      },
    },
    scores:
      input.score !== undefined
        ? [
            {
              name: "evalboard_score",
              value: input.score,
              comment: input.reason,
            },
          ]
        : undefined,
  };
}

/**
 * Dispatches trace payloads to Langfuse Ingestion API.
 */
export async function exportToLangfuse(
  payloads: LangfuseTracePayload[],
  options: LangfuseExportOptions,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  if (!options.host || !options.publicKey || !options.secretKey) {
    return {
      success: false,
      error: "Missing required Langfuse credentials (host, publicKey, or secretKey)",
    };
  }

  const endpoint = `${options.host.replace(/\/+$/, "")}/api/public/ingestion`;
  const credentials = Buffer.from(`${options.publicKey}:${options.secretKey}`).toString("base64");

  const batch = {
    batch: payloads.map((p) => ({
      id: p.id,
      type: "trace-create",
      body: {
        id: p.id,
        name: p.name,
        metadata: p.metadata,
      },
    })),
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify(batch),
    });

    return {
      success: response.ok,
      statusCode: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}: ${await response.text()}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
