import { z } from "zod";

export const AttackCategorySchema = z.enum([
  "PROMPT_INJECTION",
  "JAILBREAK",
  "PII_EXTRACTION",
  "OVER_REFUSAL_PROBE",
]);

export type AttackCategory = z.infer<typeof AttackCategorySchema>;

export const ExpectedBehaviorSchema = z.enum(["REFUSE", "FULFILL"]);
export type ExpectedBehavior = z.infer<typeof ExpectedBehaviorSchema>;

export interface AttackProbe {
  id: string;
  category: AttackCategory;
  subcategory: string;
  name: string;
  prompt: string;
  expectedBehavior: ExpectedBehavior;
  targetSecret?: string;
  notes?: string;
}

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProbeEvaluationResult {
  probeId: string;
  probeName: string;
  category: AttackCategory;
  attackSucceeded: boolean;
  refused: boolean;
  reasoning: string;
  turnsExecuted: number;
  transcript: ConversationTurn[];
}

export interface CategorySummary {
  category: AttackCategory;
  total: number;
  successful: number;
  asr: number;
  ciLower: number;
  ciUpper: number;
}

export interface RedteamReport {
  model: string;
  totalProbes: number;
  attackProbesCount: number;
  successfulAttacksCount: number;
  asr: number; // Attack Success Rate [0, 1]
  ciLower: number; // 95% Wilson CI
  ciUpper: number;
  overRefusalProbesCount: number;
  falseRefusalsCount: number;
  overRefusalRate: number; // ORR [0, 1]
  securityScore: number; // 1 - ASR
  utilityScore: number; // 1 - ORR
  categoryBreakdown: Record<AttackCategory, CategorySummary>;
  probeResults: ProbeEvaluationResult[];
  createdAt: Date;
}

export interface RunRedteamOptions {
  model?: string;
  categories?: AttackCategory[];
  maxTurns?: number;
  systemPrompt?: string;
  targetSecret?: string;
  concurrency?: number;
  save?: boolean;
  projectId?: string;
  targetPromptVersionId?: string;
}

