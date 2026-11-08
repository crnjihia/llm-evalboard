import { hashGraderContent } from "@evalboard/core";
import type { GradeInput, Grader, GraderOutcome } from "@evalboard/graders";
import { z } from "zod";

export const performanceGraderConfigSchema = z.object({
  metric: z.enum(["latency", "cost"]),
  maxThreshold: z.number().nonnegative(),
});

export type PerformanceGraderConfig = z.infer<typeof performanceGraderConfigSchema>;

export class PerformanceGrader implements Grader<PerformanceGraderConfig> {
  public readonly type: string;
  public readonly versionId: string;
  public readonly config: PerformanceGraderConfig;

  constructor(rawConfig: unknown) {
    this.config = performanceGraderConfigSchema.parse(rawConfig ?? {});
    this.type = `performance-${this.config.metric}`;
    this.versionId = hashGraderContent({
      type: this.type,
      config: this.config as unknown as Record<string, unknown>,
    });
  }

  grade(input: GradeInput): GraderOutcome {
    const context = input.context ?? {};
    let observedValue = 0;

    if (this.config.metric === "latency") {
      observedValue = typeof context.latencyMs === "number" ? context.latencyMs : 0;
    } else {
      observedValue = typeof context.costUsd === "number" ? context.costUsd : 0;
    }

    const pass = observedValue <= this.config.maxThreshold;
    const unit = this.config.metric === "latency" ? "ms" : "USD";
    return {
      score: pass ? 1.0 : 0.0,
      pass,
      reason: pass
        ? `${this.config.metric} ${observedValue} ${unit} <= max ${this.config.maxThreshold} ${unit}`
        : `${this.config.metric} ${observedValue} ${unit} > max ${this.config.maxThreshold} ${unit}`,
      details: {
        metric: this.config.metric,
        observedValue,
        maxThreshold: this.config.maxThreshold,
      },
    };
  }
}
