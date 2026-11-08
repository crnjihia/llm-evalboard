# ADR-009: CI/CD Merge Gating, PR Sticky Comment Bot, and Observability Integrations

## Context
Deploying prompt and model changes into production without statistical verification risks silent regressions, unpredictable cost increases, and latency degradation. In traditional software engineering, continuous integration (CI) relies on binary deterministic tests. In LLM applications, single-shot point evaluations fail to distinguish stochastic fluctuations from genuine improvements.

We require an automated GitHub Action and CI/CD integration that:
1. Enforces statistical merge gating criteria based on 4-way verdicts.
2. Posts and updates a single, non-spammy "sticky" pull request comment with accessible visual indicators.
3. Exports evaluation telemetry into industry-standard observability platforms (OpenTelemetry and Langfuse).

## Decision

### 1. 4-Way Verdict Merge Gating Policy
We define standard gating criteria for CI workflows based on the paired statistical comparison between candidate prompt/model and baseline:

| Verdict | Statistical Criterion | CI Gate Status | Action |
|:---|:---|:---|:---|
| **`BETTER`** | $d \ge \delta$ and $95\% \text{ CI } [L, U] > 0$ | **PASS** | Merge approved. Statistically verified improvement. |
| **`NO MEANINGFUL DIFFERENCE`** | Whole $95\% \text{ CI } \subset [-\delta, +\delta]$ | **PASS** | Merge approved. Equivalence established within tolerance margin. |
| **`WORSE`** | $d \le -\delta$ and $95\% \text{ CI } [L, U] < 0$ | **FAIL** | Merge blocked. Statistically verified regression. |
| **`INCONCLUSIVE`** | CI spans $0$ and extends beyond $[-\delta, +\delta]$ | **WARN / FAIL** | Sample size too small. Action calculates additional cases needed via power analysis. |

- By default, `fail-on-regression` is enabled (`true`).
- `fail-on-inconclusive` can be configured (default `false` for developmental exploration, `true` for high-assurance release branches).

### 2. PR Sticky Comment Bot & Accessible Forest Plot
- **Sticky Comment Pattern**:
  The action searches PR comments for the unique hidden marker `<!-- evalboard-pr-comment -->`. If found, it updates the existing comment in-place to keep PR conversations clean.
- **WCAG Accessibility**:
  All verdicts, trust badges, and alerts combine distinctive icons (e.g. `[+] BETTER`, `[-] WORSE`, `[=] EQUIVALENT`, `[?] INCONCLUSIVE`) with explicit descriptive labels.
- **ASCII Forest Plot**:
  Visualizes effect size $d$, confidence interval $[L, U]$, and the $[-\delta, +\delta]$ equivalence band directly in GitHub markdown code blocks:
  ```text
  Equivalence Zone: [-0.030, +0.030]
         -0.08   -0.04    0.00   +0.04   +0.08
  Scale:   |-------|-------|-------|-------|
  delta:               [---|---]
  CI:                          [====•====]     (d = +0.0450)
  Verdict: [+] BETTER (statistically significant improvement)
  ```

### 3. Telemetry and Observability Exporters
- **OpenTelemetry GenAI Exporter**:
  Maps evaluation runs, prompt templates, models, latency, and costs into standard OpenTelemetry traces conforming to OpenTelemetry GenAI Semantic Conventions (`gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.prompt_tokens`, `gen_ai.usage.completion_tokens`, `gen_ai.response.latency`).
- **Langfuse Exporter**:
  Serializes cases, generations, and evaluation scores for ingestion into Langfuse tracing instances (`/api/public/ingestion`).

## Consequences
- **Positive**: Eliminates subjective prompt reviews in pull requests with mathematically sound statistical boundaries.
- **Positive**: Sticky comments keep PR discussion focused without notification noise.
- **Positive**: Seamless trace export into OTel and Langfuse maintains unified observability across CI and production.
