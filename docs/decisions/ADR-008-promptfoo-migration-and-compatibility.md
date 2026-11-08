# ADR-008: Promptfoo Migration, Drop-in Compatibility, and Shadow Execution Mode

## Context
Promptfoo has become an industry baseline for declarative test configuration in LLM development. Engineering teams frequently maintain hundreds of assertions inside `promptfooconfig.yaml` or `promptfoo.yaml` files. However, Promptfoo's testing model suffers from critical statistical blindspots:
1. **Binary Tallies Without Confidence Intervals**: Promptfoo reports aggregate pass/fail percentages without binomial or bootstrap confidence intervals, obscuring whether an 82% vs 85% difference is statistically distinguishable from random noise.
2. **Unpaired Stochastic Instability**: Running single-shot tests without seeded repetitions fails to expose high variance or flaky outputs. A model that passes once may fail 40% of the time under stochastic sampling.
3. **Absence of Equivalence Bounds**: Without a declared smallest effect size of interest ($\delta$), prompt changes with trivial shifts ($\Delta < 1\%$) are falsely celebrated as improvements or rejected as regressions.
4. **No Calibrated Judge Trust**: Promptfoo's `llm-rubric` assertions run uncalibrated single-model evaluations vulnerable to position, verbosity, and self-enhancement biases.

To facilitate frictionless adoption and painless migration without requiring teams to abandon existing test investments, `llm-evalboard` provides drop-in compatibility and a side-by-side coexistence architecture.

## Decision

### 1. Dedicated Compatibility Package (`@evalboard/promptfoo-compat`)
We isolate Promptfoo interoperability into `@evalboard/promptfoo-compat`, maintaining separation from `@evalboard/core` and keeping core content-addressed immutability clean.

### 2. Declarative Config Parser & Assertion Mapping
- **Schema & Normalization**:
  The parser accepts standard `promptfoo.yaml` / `promptfooconfig.yaml` definitions (supporting shorthand providers, `file://` prompt templates, test matrices, and variable substitutions).
- **Assertion Translator**:
  Translates standard Promptfoo assertions into `@evalboard/graders`:
  - `equals` $\to$ `ExactMatchGrader` (`caseSensitive`, `trim`)
  - `contains` $\to$ `ContainsGrader` (`caseSensitive: false`)
  - `not-contains` $\to$ `ContainsGrader` with inverted logic
  - `contains-all` $\to$ `ContainsGrader` (multi-match mode)
  - `contains-any` $\to$ `SetMatchGrader` / `ContainsGrader` (disjunction mode)
  - `regex` $\to$ `RegexGrader`
  - `is-json` / `json-schema` $\to$ `JsonSchemaGrader`
  - `llm-rubric` / `model-graded-closedqa` $\to$ `LlmRubricGrader`
  - `similar` / `cosine` $\to$ Semantic similarity cosine grader
  - `cost` / `latency` $\to$ Performance threshold grader
- **Warning System**:
  Unsupported or non-deterministic assertions (e.g. arbitrary `javascript`, `python`, `webhook`) emit typed `MappingWarning` records with actionable recommendations. Non-mappable assertions are never silently skipped.

### 3. Bidirectional Importer and Exporter
- **Import (`evalboard promptfoo import`)**:
  Converts a `promptfoo.yaml` file into an Evalboard `SuiteConfig`, synthesizing content-addressed `PromptVersion` entities, `Dataset` cases with `input`/`expected`/`tags`, and `GraderConfig` specs.
- **Export (`evalboard promptfoo export`)**:
  Converts Evalboard suites and test cases back into standard `promptfooconfig.yaml` syntax, enabling dual-running in legacy CI workflows.

### 4. Shadow Run Execution Engine
The `ShadowRunner` allows teams to execute existing Promptfoo configuration files directly through Evalboard:
- Executes paired repeats with seeded pseudo-randomness across candidate models.
- Calculates **both**:
  1. **Promptfoo-Style Metric**: Raw single-pass rate tally ($k / n$).
  2. **Evalboard Statistical Metric**: Mean score, standard error, 95% confidence intervals, and 4-way verdict (`BETTER`, `WORSE`, `NO MEANINGFUL DIFFERENCE`, `INCONCLUSIVE`).
- **Divergence Analysis**:
  Flags "False Passes" (cases where Promptfoo marked pass on a single run, but Evalboard reveals failure rate $\ge 30\%$ across repeats or variance $> 0.15$).

## Consequences
- **Positive**: Zero switching cost for engineering teams already using Promptfoo.
- **Positive**: Immediate exposure of stochastic variance and false passes in existing test suites without rewriting configs.
- **Positive**: Bidirectional interop prevents vendor lock-in.
- **Negative**: Dynamic Promptfoo assertion scripts (`javascript`, `python`) cannot be safely executed inside content-addressed sandbox without specialized sandboxing; these trigger explicit migration warnings.
