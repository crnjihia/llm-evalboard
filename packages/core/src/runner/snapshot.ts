import { execSync } from "node:child_process";
import type { ModelConfig } from "../domain.js";

export interface EnvironmentSnapshot {
  gitSha: string | null;
  nodeVersion: string;
  osPlatform: string;
  capturedAt: string;
}

export function getGitSha(): string | null {
  if (process.env.GIT_SHA) {
    return process.env.GIT_SHA;
  }
  if (process.env.GITHUB_SHA) {
    return process.env.GITHUB_SHA;
  }
  try {
    const output = execSync("git rev-parse HEAD", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

export function captureEnvironmentSnapshot(): EnvironmentSnapshot {
  return {
    gitSha: getGitSha(),
    nodeVersion: process.version,
    osPlatform: process.platform,
    capturedAt: new Date().toISOString(),
  };
}

export interface ModelReproducibilityCheck {
  model: string;
  supportsSeed: boolean;
  isDeterministic: boolean;
  reproducibilityNotice: string;
}

/**
 * Validates whether a model arm supports seed/temperature reproducibility.
 */
export function checkArmReproducibility(
  modelConfig: ModelConfig,
  supportsSeed = false,
): ModelReproducibilityCheck {
  const temp = (modelConfig.parameters?.temperature as number | undefined) ?? 0.0;
  const isZeroTemp = temp === 0;

  if (supportsSeed) {
    return {
      model: modelConfig.model,
      supportsSeed: true,
      isDeterministic: true,
      reproducibilityNotice: "Model supports provider-level random seeds.",
    };
  }

  if (isZeroTemp) {
    return {
      model: modelConfig.model,
      supportsSeed: false,
      isDeterministic: true,
      reproducibilityNotice:
        "Temperature is 0.0; execution is largely deterministic without native seed support.",
    };
  }

  return {
    model: modelConfig.model,
    supportsSeed: false,
    isDeterministic: false,
    reproducibilityNotice:
      "Model lacks native seed parameter with temperature > 0. Re-runs without cache will exhibit stochastic variance.",
  };
}
