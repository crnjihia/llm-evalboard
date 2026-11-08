# Continuous Evaluation with GitHub Actions

`llm-evalboard` provides a production-ready GitHub Action (`action/`) that transforms continuous integration for generative AI. Instead of relying on subjective code reviews or flaky, single-run assertions, your CI pipeline enforces **statistical merge gating** with automated PR sticky comments and telemetry export.

---

## Why Statistical Merge Gating in CI?

Prompt and model upgrades are notorious for introducing unintended regressions:
- A prompt change that seems to improve answer conciseness might silently degrade factual accuracy on edge cases.
- A single test pass rate (e.g. "85% passing") is often within the margin of noise from an identical run (e.g. "82% passing").
- Traditional CI flags flakiness as failure, causing engineers to ignore CI or click "re-run until green."

With `llm-evalboard`'s GitHub Action:
1. **Regressions are Blocked Mathematically:** Pull requests that produce a statistically significant degradation (`WORSE`) fail the merge gate.
2. **Equivalence is Rewarded:** If a cheaper or faster model performs within the equivalence band ($[-\delta, +\delta]$), the change passes with a `NO MEANINGFUL DIFFERENCE` verdict.
3. **Flakiness is Quantified:** If the test suite is too small or variance is too high, the gate flags `INCONCLUSIVE` and recommends the exact number of test cases required to prove non-inferiority.
4. **Zero Comment Spam:** Updates a single, sticky PR comment with ASCII forest plots and slice breakdowns.

---

## 1. Quickstart Workflow (`.github/workflows/eval.yml`)

Create `.github/workflows/eval.yml` in your repository:

```yaml
name: LLM Evaluation Gate

on:
  pull_request:
    branches: [main]
    paths:
      - 'prompts/**'
      - 'evalboard.yaml'
      - 'datasets/**'

permissions:
  contents: read
  pull-requests: write # Required for posting sticky comments

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Run llm-evalboard Evaluation Gate
        uses: ./action
        with:
          config: evalboard.yaml
          github-token: ${{ secrets.GITHUB_TOKEN }}
          delta: 0.03
          repeats: 3
          fail-on-regression: true
          fail-on-inconclusive: false
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

---

## 2. Action Configuration Reference

### Action Inputs (`action/action.yml`)

| Input | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `config` | `string` | `evalboard.yaml` | Path to the evaluation suite configuration file. |
| `github-token` | `string` | `${{ github.token }}` | GitHub token for posting or updating the sticky PR comment. |
| `fail-on-regression` | `boolean` | `true` | If `true`, the workflow fails when the verdict is `WORSE`. |
| `fail-on-inconclusive` | `boolean` | `false` | If `true`, the workflow fails when statistical evidence is insufficient (`INCONCLUSIVE`). |
| `delta` | `number` | `0.03` | Equivalence tolerance margin $\delta$ (e.g. 0.03 = 3%). |
| `repeats` | `number` | `3` | Number of stochastic repeats per test case to estimate variance. |
| `baseline-model` | `string` | `""` | Optional override for baseline provider/model ID. |
| `candidate-model` | `string` | `""` | Optional override for candidate provider/model ID. |
| `otel-endpoint` | `string` | `""` | OTLP HTTP JSON endpoint for streaming GenAI spans (e.g. `http://otel-collector:4318/v1/traces`). |
| `langfuse-public-key` | `string` | `""` | Langfuse public API key. |
| `langfuse-secret-key` | `string` | `""` | Langfuse secret API key. |
| `langfuse-host` | `string` | `https://cloud.langfuse.com` | Langfuse API host URL. |

### Action Outputs

| Output | Type | Description |
| :--- | :--- | :--- |
| `verdict` | `string` | Final statistical verdict: `BETTER`, `WORSE`, `NO MEANINGFUL DIFFERENCE`, or `INCONCLUSIVE`. |
| `effect-size` | `string` | Paired score difference ($d = \bar{X}_{\text{candidate}} - \bar{X}_{\text{baseline}}$). |
| `ci-lower` | `string` | Lower bound of the 95% bootstrap confidence interval. |
| `ci-upper` | `string` | Upper bound of the 95% bootstrap confidence interval. |
| `passed` | `boolean` | `true` if merge gating criteria were satisfied, `false` otherwise. |
| `report-markdown` | `string` | Full Markdown evaluation report posted to the PR. |

---

## 3. The Sticky PR Comment Bot

The Action automatically finds and updates an existing bot comment on the active PR using the `<!-- evalboard-pr-comment -->` marker. This prevents notification noise across subsequent git pushes.

### Comment Layout & Features:

1. **Accessible Status Badge:** 
   - `🟢 [+] BETTER` — Statistically verified improvement ($d \ge +\delta$, CI above 0).
   - `🔴 [-] WORSE` — Statistically verified regression ($d \le -\delta$, CI below 0).
   - `🔵 [=] NO MEANINGFUL DIFFERENCE` — Equivalent within $\pm\delta$.
   - `🟡 [?] INCONCLUSIVE` — Confidence interval spans across tolerance margin.
2. **ASCII Forest Plot:** Visualizes the point estimate and 95% confidence interval against the equivalence band:
   ```text
   Equivalence Band (±δ): [-0.030, +0.030]
   Point Estimate (d):     +0.0850 (95% CI: [+0.0320, +0.1380])

   Scale:    -0.20      -0.10      +0.00      +0.10      +0.20
   Axis:    |---------|---------|---------|---------|
   delta:                       |                      (±0.030)
   CI:                                [---•---]        (d = +0.0850)
   ```
3. **Core Metrics Comparison Table:** Side-by-side comparison of Mean Score, P50/P90/P95 Latency, Token Cost in USD, and Total Evaluated Pairs.
4. **Slice Analysis Table:** Subgroup breakdown across metadata tags (e.g. `tag=edge-case`, `input_length=long`) to detect hidden regressions in critical sub-populations.
5. **Statistical Power Recommendation:** When a verdict is `INCONCLUSIVE`, outputs the exact number of cases needed to achieve 80% power at $\alpha = 0.05$.

---

## 4. Observability Integrations

Continuous evaluation should not live in a silo separate from production monitoring. `llm-evalboard` natively exports CI evaluation traces to OpenTelemetry and Langfuse.

### OpenTelemetry (OTel) Export
Configure `otel-endpoint` to forward standardized GenAI spans:
- **Semantic Conventions:** Complies with OpenTelemetry GenAI semantic conventions:
  - `gen_ai.system`: e.g. `anthropic`, `openai`
  - `gen_ai.request.model`: Model identifier
  - `gen_ai.usage.prompt_tokens` & `gen_ai.usage.completion_tokens`
  - `evalboard.score`: Grader score assigned to output
  - `evalboard.verdict`: Paired verdict
  - `evalboard.run_id`: Execution run identifier

```yaml
- uses: ./action
  with:
    config: evalboard.yaml
    otel-endpoint: "http://otel.internal.net:4318/v1/traces"
```

### Langfuse Integration
Stream evaluation scores and generations into your Langfuse dashboard:

```yaml
- uses: ./action
  with:
    config: evalboard.yaml
    langfuse-public-key: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
    langfuse-secret-key: ${{ secrets.LANGFUSE_SECRET_KEY }}
    langfuse-host: "https://cloud.langfuse.com"
```

---

## 5. Merge Gating Policy Recipes

### Policy A: Strict Quality Gate (Zero Degradation & High Confidence)
Best for mission-critical prompts (e.g. financial extraction, clinical summarization):
```yaml
fail-on-regression: true
fail-on-inconclusive: true
delta: 0.02
repeats: 5
```
*Effect: Blocks merges unless the candidate is statistically proven to be BETTER or strictly EQUIVALENT within 2%.*

### Policy B: Model Cost Optimization Gate
Best when evaluating migrating to a smaller, cheaper, or faster model (e.g., Claude 3.5 Sonnet $\to$ Haiku 3.5):
```yaml
fail-on-regression: true
fail-on-inconclusive: false
delta: 0.04
repeats: 3
```
*Effect: Passes if the new model achieves `NO MEANINGFUL DIFFERENCE` within 4%, enabling massive cost savings without quality loss.*
