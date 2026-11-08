# Getting Started with llm-evalboard

`llm-evalboard` is a statistically honest evaluation framework and dashboard for LLM applications. It provides mathematically grounded answers to the question: **"Is this prompt or model change a real improvement, or just noise?"**

---

## Why llm-evalboard?

Traditional LLM evaluation tools run a test case once, check if it passes a threshold, and report a flat accuracy percentage. Because LLM outputs are stochastic, a change that appears to increase accuracy by +3% on a single run is frequently pure random variance—or worse, a regression hidden by test flakiness.

`llm-evalboard` fixes this by treating **statistics as the product**:
1. **Paired Bootstrap Comparisons:** Evaluates baseline and candidate variants on the exact same inputs across repeats to isolate the true treatment effect.
2. **Equivalence Bands ($\pm\delta$):** Distinguishes between statistically meaningful improvements and trivial noise within an indifference margin.
3. **Four-Way Verdicts:** Replaces ambiguous pass rates with actionable verdicts: `BETTER`, `WORSE`, `NO MEANINGFUL DIFFERENCE`, or `INCONCLUSIVE`.
4. **Content-Addressed Immutability:** Uses SHA-256 hashes of canonical representations so unchanged prompts, datasets, or graders never trigger redundant paid provider calls.

---

## 1. Prerequisites

- **Node.js**: v22.0.0 or higher
- **pnpm**: v9.0.0 or higher (v12+ recommended)
- **PostgreSQL**: (Optional for CLI file runs, required for dashboard & flywheel persistence; run via `docker compose up -d db`)

---

## 2. Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/llm-evalboard/llm-evalboard.git
cd llm-evalboard
pnpm install
pnpm build
```

Link the CLI globally or use `pnpm --filter @evalboard/cli`:

```bash
pnpm --filter @evalboard/cli link --global
evalboard --help
```

---

## 3. Creating Your First Evaluation Suite (`evalboard.yaml`)

An evaluation suite brings together **prompts**, **test datasets**, **providers**, and **graders**. Create a file named `evalboard.yaml` in your workspace:

```yaml
name: Customer Support QA Suite
description: Evaluates prompt changes for customer inquiry summarization.

# Equivalence margin: differences smaller than 3% are treated as equivalent
delta: 0.03

# Prompts under test
prompts:
  - id: baseline-prompt
    path: ./prompts/support-v1.txt
  - id: candidate-prompt
    path: ./prompts/support-v2.txt

# Dataset containing test cases
dataset:
  path: ./datasets/support-tickets.jsonl

# LLM Providers to test against
providers:
  - id: baseline-model
    provider: mock
    model: support-v1-model
    temperature: 0.2
  - id: candidate-model
    provider: mock
    model: support-v2-model
    temperature: 0.2

# Graders to score outputs
graders:
  - id: json-validity
    type: is-json
    weight: 0.3
  - id: key-phrases
    type: contains-all
    config:
      substrings: ["Resolution", "Ticket ID"]
    weight: 0.3
  - id: quality-judge
    type: llm-rubric
    config:
      rubric: "Rate response professionalism, clarity, and conciseness on a scale from 1 to 5."
      model: mock:judge-model
    weight: 0.4
```

### Prompt File Example (`prompts/support-v1.txt`)
```text
You are a customer service assistant. Summarize the following customer issue concisely:
{{ticket_body}}
Output JSON with keys "summary", "category", and "resolution".
```

### Dataset File Example (`datasets/support-tickets.jsonl`)
```json
{"id": "case-001", "inputs": {"ticket_body": "My screen went black after the firmware update. Ticket ID: 49821. Resolution needed urgently."}, "expected": "Screen black after firmware update", "tags": ["hardware", "urgent"]}
{"id": "case-002", "inputs": {"ticket_body": "Billing discrepancy on invoice #1023. Ticket ID: 11029. Resolution: refund please."}, "expected": "Billing discrepancy", "tags": ["billing"]}
{"id": "case-003", "inputs": {"ticket_body": "Cannot login with SSO. Ticket ID: 88201. Need resolution today."}, "expected": "SSO authentication failure", "tags": ["auth"]}
```

---

## 4. Running the Evaluation

Execute the evaluation using the CLI:

```bash
# Run with 3 repeats to estimate stochastic variance
evalboard run --config evalboard.yaml --repeats 3
```

### What Happens During `evalboard run`:
1. **Matrix Expansion:** Computes the Cartesian product of prompts $\times$ datasets $\times$ providers $\times$ repeats.
2. **Canonical Hashing & Cache Lookup:** Computes SHA-256 hashes of inputs. If a cell was evaluated previously with the exact same content, results are fetched instantly from cache at \$0 cost.
3. **Paired Execution:** Calls providers with rate-limiting, exponential backoff, and concurrency controls.
4. **Grading & Scoring:** Evaluates outputs deterministically and with LLM judges.
5. **Statistical Analysis:** Performs cluster bootstrap resampling, computes 95% confidence intervals, effect sizes (Cohen's $d_z$), and issues a 4-way verdict.

---

## 5. Understanding the 4-Way Verdict

`llm-evalboard` never issues a simple "Passed" or "Failed" when comparing models or prompts. Instead, it computes the 95% confidence interval $[L, U]$ of the paired difference $\Delta = \text{Score}_{\text{candidate}} - \text{Score}_{\text{baseline}}$ against an equivalence margin $[-\delta, +\delta]$:

```text
Equivalence Band: [ -δ, +δ ]
Point Estimate d: Score(Candidate) - Score(Baseline)
Confidence Interval: [ L, U ] (95% Bootstrap CI)
```

| Verdict | Condition | Meaning | Actionable Recommendation |
| :--- | :--- | :--- | :--- |
| **`BETTER`** | $L > 0$ and $d \ge +\delta$ | The candidate reliably outperforms the baseline beyond the equivalence margin. | **Safe to deploy to production.** |
| **`WORSE`** | $U < 0$ and $d \le -\delta$ | The candidate demonstrates a statistically verified regression. | **Block merge/deployment.** |
| **`NO MEANINGFUL DIFFERENCE`** | $[L, U] \subseteq [-\delta, +\delta]$ | The true difference is completely bounded within the indifference band. | **Choose the cheaper/faster variant.** |
| **`INCONCLUSIVE`** | CI overlaps with zero and crosses $\pm\delta$ | Sample size is too small or output variance is too high to know. | **Increase sample size or repeats.** |

---

## 6. Comparing Runs and Slice Analysis

To compare two historical runs in the terminal:

```bash
evalboard compare <baseline-run-id> <candidate-run-id> --delta 0.03
```

This outputs:
- **Ascii Forest Plot:** Visualizing the effect size and 95% confidence interval against the equivalence threshold.
- **Summary Metrics Table:** Mean scores, latency (P50/P90/P95), and token costs in USD.
- **Slice Analysis Table:** Breakdown across metadata tags (e.g., `tag=urgent`, `tag=billing`) and input length buckets (`short`, `medium`, `long`). Identifies whether an overall "BETTER" verdict masks regressions in critical sub-populations.
- **Power Analysis:** Computes the minimum sample size required to reach statistical power ($1 - \beta \ge 0.80$) given the observed variance.

---

## 7. Launching the Web Dashboard

To explore evaluation results visually:

```bash
# Start PostgreSQL database
docker compose up -d db

# Launch Next.js dashboard
pnpm --filter @evalboard/web dev
```

Navigate to `http://localhost:3000` to access:
- **Executive Comparison View:** Dual-run metrics with WCAG-compliant status badges and interactive forest plots.
- **Pareto Frontier Explorer:** Cost vs Quality and Latency vs Quality interactive scatter plots with uncertainty error bars.
- **Judge Calibration:** Inter-annotator agreement metrics (weighted Cohen's $\kappa$) and Trust Badges (`TRUSTED`, `USE_WITH_CAUTION`, `NOT_TRUSTED`).
- **Slice Explorer:** Drill down into failure clusters and individual sample diffs.

---

## 8. CLI Command Summary

| Command | Description |
| :--- | :--- |
| `evalboard run` | Executes an evaluation suite defined in `evalboard.yaml`. |
| `evalboard compare <r1> <r2>` | Compares two runs statistically with forest plot and slice analysis. |
| `evalboard prompt diff <p1> <p2>` | Computes semantic and line diffs between prompt templates. |
| `evalboard dataset check <path>` | Audits dataset quality, missing variables, duplicates, and token length distribution. |
| `evalboard judge calibrate` | Calibrates an LLM judge against human ratings using weighted Cohen's $\kappa$. |
| `evalboard redteam run` | Executes adversarial security probes against OWASP Top 10 for LLMs. |
| `evalboard flywheel ingest` | Ingests production traces, scrubs PII, and deduplicates inputs. |
| `evalboard promptfoo import` | Migrates a `promptfooconfig.yaml` into Evalboard format. |
| `evalboard promptfoo shadow` | Runs shadow execution with stochastic repeats on a Promptfoo config to detect false passes. |
| `evalboard promptfoo export` | Exports an Evalboard suite back to `promptfooconfig.yaml`. |

For next steps, read the [Architecture Overview](./architecture-overview.md), the [Promptfoo Migration Guide](./migration/from-promptfoo.md), or [Setting up CI/CD with GitHub Actions](./ci-cd-github-actions.md).

