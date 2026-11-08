# Promptfoo Compatibility and Migration Mapping Reference

This document details the configuration and assertion mapping between **Promptfoo** (`promptfooconfig.yaml` / `promptfoo.yaml`) and **Evalboard** (`evalboard.yaml` / `@evalboard/core`).

---

## 1. Overview and Design Principles

Evalboard is an independent, statistically rigorous evaluation engine. Rather than acting as a runtime wrapper around Promptfoo, Evalboard provides:
1. **Drop-in Configuration Parsing**: Native parsing and validation of Promptfoo YAML configs.
2. **Assertion Translation**: Translating Promptfoo assertions into deterministic, LLM-judge, or statistical graders.
3. **Shadow Execution Mode**: Running Promptfoo suites under repeated seeded evaluations to uncover hidden variance, false passes, and confidence bounds.
4. **Bidirectional Interoperability**: Importing Promptfoo suites to Evalboard and exporting Evalboard suites to Promptfoo.

---

## 2. Assertion Mapping Matrix

| Promptfoo Assertion | Evalboard Grader | Support Status | Transformation Notes |
|:---|:---|:---|:---|
| `equals` | `ExactMatchGrader` | **SUPPORTED** | Direct 1:1 match. Supports `caseSensitive` and string normalization. |
| `contains` | `ContainsGrader` | **SUPPORTED** | Case-insensitive substring check (`caseSensitive: false`). |
| `not-contains` | `ContainsGrader` (inverted) | **SUPPORTED** | Inverted match logic: score = 1 if substring is absent, 0 if present. |
| `contains-all` | `ContainsGrader` (multi) | **SUPPORTED** | All values in array must be present in output. |
| `contains-any` | `SetMatchGrader` | **SUPPORTED** | At least one item in the set must match. |
| `regex` | `RegexGrader` | **SUPPORTED** | Regular expression evaluation with full pattern support. |
| `is-json` | `JsonSchemaGrader` | **SUPPORTED** | Validates output is well-formed JSON. Optional schema validation. |
| `json-schema` | `JsonSchemaGrader` | **SUPPORTED** | Validates output adheres to specified JSON schema. |
| `cost` | `PerformanceGrader` / `Usage` | **SUPPORTED** | Validates call cost in USD against threshold. |
| `latency` | `PerformanceGrader` / `Latency` | **SUPPORTED** | Validates execution latency in milliseconds against threshold. |
| `llm-rubric` | `LlmRubricGrader` | **TRANSFORMED** | Upgraded with position-bias swap mitigation and calibrated confidence scoring. |
| `model-graded-closedqa` | `LlmRubricGrader` | **TRANSFORMED** | Converted into rubric checking answer alignment against reference facts. |
| `factuality` | `LlmRubricGrader` | **TRANSFORMED** | Converted into rubric assessing factual accuracy against ground truth. |
| `similar` / `cosine` | `SimilarityGrader` | **SUPPORTED** | Token/character n-gram Jaccard or semantic cosine similarity with threshold. |
| `javascript` | Sandboxed script | **PARTIAL** | Evaluated in restricted sandbox when possible; otherwise flagged with warning. |
| `python` | Python runner | **UNSUPPORTED** | Requires external Python runtime. Emits warning `PF_WARN_CODE_EXECUTION`. |
| `webhook` | HTTP webhook | **UNSUPPORTED** | External network call. Emits warning `PF_WARN_WEBHOOK`. |

---

## 3. Warning Codes Reference

When importing or executing Promptfoo configurations containing unmappable or non-deterministic constructs, Evalboard emits structured warnings:

- **`PF_WARN_CODE_EXECUTION`**:
  *Trigger*: Promptfoo config contains `python` assertion or arbitrary host script execution.
  *Remediation*: Replace script assertions with `ExactMatchGrader`, `RegexGrader`, or `JsonSchemaGrader`.
- **`PF_WARN_WEBHOOK`**:
  *Trigger*: Assertion targets an external HTTP endpoint (`webhook`).
  *Remediation*: Mock or isolate verification logic using Evalboard deterministic graders.
- **`PF_WARN_COMPLEX_PROVIDER`**:
  *Trigger*: Provider definition uses proprietary Promptfoo plugins or custom JS providers.
  *Remediation*: Map provider to standard Evalboard providers (`openai`, `anthropic`, `ollama`, `openrouter`, `mock`).
- **`PF_WARN_UNSUPPORTED_ASSERTION`**:
  *Trigger*: Assertion type is unrecognized or deprecated in Promptfoo.
  *Remediation*: Check assertion syntax and update to standard types.

---

## 4. Shadow Execution Mode

Promptfoo suites frequently yield a false sense of security by executing each test case only once ($N=1$). A prompt that passes once may fail under stochastic re-sampling.

Evalboard's **Shadow Runner** executes the Promptfoo suite with:
- **$R \ge 3$ Repeats**: Multiple stochastic evaluations per test case.
- **Seed-Controlled PRNG**: Reproducible sampling.
- **Divergence Metrics**:
  - **Raw Pass Rate**: Single-shot Promptfoo tally ($k / n$).
  - **Evalboard Statistical Score**: Empirical mean score, standard deviation, and $95\%$ Wilson / bootstrap confidence intervals.
  - **False Passes**: Tests that Promptfoo reported as passing on Turn 1, but fail on subsequent stochastic repeats (failure rate $\ge 30\%$).
  - **4-Way Verdict**: Statistical comparison against baseline (`BETTER`, `WORSE`, `NO MEANINGFUL DIFFERENCE`, `INCONCLUSIVE`).

---

## 5. CLI Usage

### Import Promptfoo Suite to Evalboard
```bash
evalboard promptfoo import promptfooconfig.yaml --suite my-eval --out ./suites/my-eval.yaml
```

### Run Shadow Evaluation
```bash
evalboard promptfoo shadow promptfooconfig.yaml --repeats 3 --model mock:echo
```

### Export Evalboard Suite to Promptfoo
```bash
evalboard promptfoo export ./suites/my-eval.yaml --out ./promptfooconfig.yaml
```
