import type { TriageAction, TriageClassification, TriagePriority } from "./types.js";

export interface TriageInput {
  id: string;
  output: string;
  feedback?: {
    rating?: number;
    comment?: string;
    flagged?: boolean;
    reason?: string;
    tags?: string[];
  };
  score?: number; // e.g. from an automated judge or rule
  latencyMs?: number;
  metadata?: Record<string, unknown>;
}

const NEGATIVE_KEYWORDS = [
  "hallucination",
  "hallucinated",
  "incorrect",
  "wrong",
  "false",
  "broke",
  "bug",
  "bad",
  "error",
  "garbage",
  "toxic",
  "refused",
  "failed",
];

const ERROR_PATTERNS = [
  /rate\s*limit/i,
  /internal\s*server\s*error/i,
  /500\s*error/i,
  /typeerror/i,
  /syntaxerror/i,
  /json\.parse/i,
  /timed?\s*out/i,
];

export function classifyTrace(trace: TriageInput): TriageClassification {
  const reasons: string[] = [];
  let priorityScore = 0; // Higher = more urgent

  // 1. Feedback Evaluation
  const feedback = trace.feedback;
  if (feedback) {
    if (feedback.flagged) {
      reasons.push("Explicitly flagged by user");
      priorityScore += 40;
    }

    if (feedback.rating !== undefined) {
      if (feedback.rating < 0) {
        reasons.push(`Negative rating received (${feedback.rating})`);
        priorityScore += 35;
      } else if (feedback.rating === 0) {
        reasons.push("Zero rating received");
        priorityScore += 30;
      }
    }

    if (feedback.comment) {
      const commentLower = feedback.comment.toLowerCase();
      const matchedNegative = NEGATIVE_KEYWORDS.filter((kw) => commentLower.includes(kw));
      if (matchedNegative.length > 0) {
        reasons.push(`User complaint keywords detected: ${matchedNegative.join(", ")}`);
        priorityScore += 20;
      }
    }
  }

  // 2. Grader / Judge Evaluation Score
  if (trace.score !== undefined) {
    if (trace.score <= 0.3) {
      reasons.push(`Critically low evaluation score (${trace.score.toFixed(2)})`);
      priorityScore += 35;
    } else if (trace.score <= 0.6) {
      reasons.push(`Sub-par evaluation score (${trace.score.toFixed(2)})`);
      priorityScore += 20;
    }
  }

  // 3. Output Error / Refusal / Empty checks
  const outputTrimmed = trace.output.trim();
  if (outputTrimmed.length === 0) {
    reasons.push("Empty model output received");
    priorityScore += 40;
  } else {
    for (const pattern of ERROR_PATTERNS) {
      if (pattern.test(outputTrimmed)) {
        reasons.push(`Output contains error pattern: ${pattern.source}`);
        priorityScore += 40;
        break;
      }
    }
  }

  // 4. Latency checks
  if (trace.latencyMs && trace.latencyMs > 15000) {
    reasons.push(`High latency detected (${(trace.latencyMs / 1000).toFixed(1)}s)`);
    priorityScore += 10;
  }

  // Determine Triage Priority
  let priority: TriagePriority = "LOW";
  let suggestedAction: TriageAction = "DISCARD";

  if (priorityScore >= 60) {
    priority = "CRITICAL";
    suggestedAction = "PROMOTE";
  } else if (priorityScore >= 35) {
    priority = "HIGH";
    suggestedAction = "PROMOTE";
  } else if (priorityScore >= 15) {
    priority = "MEDIUM";
    suggestedAction = "REVIEW";
  } else {
    priority = "LOW";
    suggestedAction = reasons.length > 0 ? "ANALYZE" : "DISCARD";
  }

  return {
    traceId: trace.id,
    priority,
    reasons,
    suggestedAction,
    score: priorityScore,
  };
}
