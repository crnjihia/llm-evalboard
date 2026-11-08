# Migrating from Promptfoo to llm-evalboard

This guide outlines how to migrate your existing [Promptfoo](https://www.promptfoo.dev) test suites to `llm-evalboard`—either as a full migration or by running Evalboard in **Shadow Mode** side-by-side with your existing CI workflows.

---

## Why Teams Upgrade from Promptfoo to llm-evalboard

Promptfoo is an excellent tool for rapid prompt prototyping and initial sanity checks. However, when teams use Promptfoo to make critical deployment decisions in CI/CD, they encounter core limitations stemming from single-point evaluation:

| Dimension | Promptfoo | llm-evalboard |
| :--- | :--- | :--- |
| **Statistical Model** | Binary Pass/Fail on a single stochastic sample | Paired bootstrap differences across stochastic repeats |
| **Equivalence Margin** | None (any difference is treated as significant) | Equivalence band $(\pm\delta)$ separates real gains from noise |
| **Flakiness Detection** | Re-running flaky tests flips passes to fails | Wilson score confidence intervals & False Pass detection |
| **Confidence Bounds** | Flat point-in-time percentage (e.g. 84%) | 95% Bootstrap Confidence Intervals $[L, U]$ on differentials |
| **Verdict Precision** | Ambiguous pass/fail | 4-Way Verdict: `BETTER`, `WORSE`, `NO DIFFERENCE`, `INCONCLUSIVE` |
| **Caching Model** | Provider-level cache by query string | Content-addressed SHA-256 DAG over inputs, prompts, and graders |
| **Judge Calibration** | Blind trust in LLM judges | Inter-rater agreement (weighted Cohen's $\kappa$) & position swap |

---

## 1. Zero-Friction Migration: The Shadow Runner

You do not need to convert your config files upfront to test your Prompfoo suites with statistical honesty. You can run `evalboard promptfoo shadow` directly on your existing `promptfooconfig.yaml`:

```bash
evalboard promptfoo shadow promptfooconfig.yaml --repeats 5 --delta 0.05
```

### What Shadow Mode Does:
1. **Parses `promptfooconfig.yaml` natively**: Resolves `file://` prompts, referenced test datasets, default assertions, and multi-provider matrices.
2. **Executes Stochastic Repeats ($R \ge 3$)**: Runs each prompt variant multiple times against the test cases with random seeds.
3. **Detects False Passes**: Identifies test cases that "passed" in a single run by chance but have an underlying success rate of less than 80%.
4. **Calculates Paired Differentials**: Resamples paired scores to produce an effect size, confidence interval, and 4-way statistical verdict.

### Example Shadow Mode Terminal Output:

```text
=== Promptfoo Shadow Execution Report ===
Config: promptfooconfig.yaml (5 test cases, 2 providers, 5 repeats)

-----------------------------------------------------------------------------------------
Test Case ID   Baseline Mean (95% CI)     Candidate Mean (95% CI)    Difference (Δ)   Status
-----------------------------------------------------------------------------------------
case-001       100.0% [85.1%, 100.0%]     100.0% [85.1%, 100.0%]       0.0%           EQUIVALENT
case-002        60.0% [23.1%,  88.2%]     100.0% [85.1%, 100.0%]     +40.0%           [+] BETTER
case-003        80.0% [37.6%,  96.4%]      40.0% [11.8%,  76.9%]     -40.0%           [-] WORSE
case-004       100.0% [85.1%, 100.0%]     100.0% [85.1%, 100.0%]       0.0%           EQUIVALENT
case-005        40.0% [11.8%,  76.9%]      80.0% [37.6%,  96.4%]     +40.0%           FALSE PASS DETECTED
-----------------------------------------------------------------------------------------

Summary Verdict: INCONCLUSIVE
Difference (d): +8.0% | 95% CI: [-12.4%, +28.4%] | Equivalence Band: [-5.0%, +5.0%]
⚠️ Warning: 1 test case was identified as a "False Pass" (flaky single-run pass).
Recommendation: Increase sample size to at least 18 cases to resolve statistical power.
```

---

## 2. Converting Promptfoo Configurations (`evalboard promptfoo import`)

To permanently migrate to `evalboard.yaml`, use the import command:

```bash
evalboard promptfoo import promptfooconfig.yaml -o evalboard.yaml
```

The importer automatically maps:
- `prompts: [...]` $\to$ content-addressed Prompt entities
- `providers: [...]` $\to$ Evalboard Provider configurations
- `tests: [...]` $\to$ structured JSONL test dataset cases
- `assert: [...]` $\to$ typed Evalboard graders

### Assertion Mapping Reference

| Promptfoo Assertion | Evalboard Grader | Notes / Implementation |
| :--- | :--- | :--- |
| `equals` | `exact-match` | Exact string match with optional case sensitivity |
| `contains` | `contains` | Substring inclusion check |
| `not-contains` | `not-contains` | Substring exclusion check |
| `contains-all` | `contains-all` | Must contain every specified substring |
| `contains-any` | `contains-any` | Must contain at least one specified substring |
| `starts-with` | `regex` | Mapped to `^prefix` anchor regex |
| `regex` | `regex` | Full ECMAScript regular expression evaluation |
| `is-json` | `is-json` | Validates valid JSON syntax |
| `json-schema` | `json-schema` | Validates JSON schema via AJV validator |
| `llm-rubric` | `llm-rubric` | Position-bias swapped LLM-as-a-judge |
| `similar` | `similarity` | Computes cosine, Jaccard, or Levenshtein similarity against reference threshold |
| `cost` | `performance` | Validates cost ceiling in USD per 1k tokens |
| `latency` | `performance` | Validates latency ceiling in milliseconds |
| `javascript` / `python` | Custom Grader | Maps to custom grader registry; emits diagnostic warning |

---

## 3. Diagnostic Warnings & Remediations

When importing configurations, the CLI may display diagnostic warnings for assertions requiring attention:

### 1. `MAPPING_CODE_ASSERTION_REQUIRES_SANDBOX`
- **Cause:** Your Promptfoo config contains inline JavaScript or Python code assertions (e.g. `type: javascript`, `value: "output.length > 50"`).
- **Remediation:** In `llm-evalboard`, custom code assertions must be declared in a standalone TypeScript module or grader plugin registered via `registerGrader(name, graderFn)`. This guarantees sandbox isolation and content-addressed reproducibility.

### 2. `MAPPING_UNSUPPORTED_TYPE_FALLBACK`
- **Cause:** An obscure or proprietary assertion type (e.g. `g-eval`, `webhook`) was encountered.
- **Remediation:** Evalboard falls back to a custom grader wrapper with an initial score of 1.0 and tags the test case for human review.

### 3. `MAPPING_TRANSFORM_NOT_SUPPORTED`
- **Cause:** An assertion specified an inline output transform function (e.g. `transform: "output.toLowerCase()"`).
- **Remediation:** Specify an explicit `OutputExtractor` in your `evalboard.yaml` (such as `regex_extract`, `json_field`, or `markdown_code_block`).

---

## 4. Exporting Back to Promptfoo (`evalboard promptfoo export`)

To share your evaluation suites with external collaborators or maintain backward compatibility with legacy tooling, export your `evalboard.yaml` back to Promptfoo format:

```bash
evalboard promptfoo export evalboard.yaml -o promptfooconfig.yaml
```

The exported YAML preserves all prompts, model specifications, test case variables, and assertion thresholds.

---

## 5. Next Steps

- Learn how to run your evaluations in CI with the [GitHub Action Guide](../ci-cd-github-actions.md).
- Understand the statistical foundations in the [Methodology Guide](../methodology.md).
- Explore the complete [Architecture Overview](../architecture-overview.md).
