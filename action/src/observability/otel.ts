import type { OtelGenAiSpan } from "../types.js";

export interface CaseSpanInput {
  suiteName: string;
  caseId: string;
  model: string;
  provider: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  score?: number;
  pass?: boolean;
}

/**
 * Creates OpenTelemetry GenAI semantic convention spans from Evalboard case results.
 */
export function createOtelGenAiSpan(input: CaseSpanInput): OtelGenAiSpan {
  const now = Date.now();
  const startTime = now - input.latencyMs;

  const traceId = Math.random().toString(16).substring(2).padEnd(32, "0");
  const spanId = Math.random().toString(16).substring(2).padEnd(16, "0");

  const attributes: Record<string, string | number | boolean> = {
    "gen_ai.system": input.provider,
    "gen_ai.request.model": input.model,
    "gen_ai.response.latency_ms": input.latencyMs,
    "evalboard.suite": input.suiteName,
    "evalboard.case_id": input.caseId,
  };

  if (input.inputTokens !== undefined) {
    attributes["gen_ai.usage.prompt_tokens"] = input.inputTokens;
  }
  if (input.outputTokens !== undefined) {
    attributes["gen_ai.usage.completion_tokens"] = input.outputTokens;
    attributes["gen_ai.usage.total_tokens"] = (input.inputTokens ?? 0) + input.outputTokens;
  }
  if (input.costUsd !== undefined) {
    attributes["gen_ai.usage.cost_usd"] = input.costUsd;
  }
  if (input.score !== undefined) {
    attributes["evalboard.score"] = input.score;
  }
  if (input.pass !== undefined) {
    attributes["evalboard.pass"] = input.pass;
  }

  return {
    traceId,
    spanId,
    name: `evalboard.evaluation.${input.model}`,
    startTimeUnixNano: (BigInt(startTime) * 1000000n).toString(),
    endTimeUnixNano: (BigInt(now) * 1000000n).toString(),
    attributes,
  };
}

/**
 * Exports spans to an OpenTelemetry collector via OTLP/HTTP JSON endpoint.
 */
export async function exportSpansToOtelEndpoint(
  spans: OtelGenAiSpan[],
  endpoint: string,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "llm-evalboard" } },
              { key: "service.version", value: { stringValue: "0.1.0" } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: "evalboard-action" },
              spans: spans.map((s) => ({
                traceId: s.traceId,
                spanId: s.spanId,
                name: s.name,
                startTimeUnixNano: s.startTimeUnixNano,
                endTimeUnixNano: s.endTimeUnixNano,
                attributes: Object.entries(s.attributes).map(([key, val]) => ({
                  key,
                  value:
                    typeof val === "string"
                      ? { stringValue: val }
                      : typeof val === "boolean"
                        ? { boolValue: val }
                        : { doubleValue: Number(val) },
                })),
              })),
            },
          ],
        },
      ],
    };

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
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
