# ADR-002: Architectural Relationship with Promptfoo

## Status
Accepted

## Context
Promptfoo is a widely adopted open-source tool for testing and securing LLM applications. While Promptfoo offers broad CLI integrations, it primarily reports pass/fail tallies and basic assertions without rigorous statistical treatment of stochastic model variance, paired difference confidence intervals, equivalence bounds, or judge calibration against human labels.

We need to define how `llm-evalboard` relates to Promptfoo: whether to build as an extension/wrapper or build an independent evaluation engine while supporting configuration interoperability.

## Options Considered

1. **Option 1: Wrap Promptfoo.**
   - Run Promptfoo underneath and post-process its output JSON.
   - *Drawbacks:* Constrained by Promptfoo's runner architecture, cache semantics, lack of fine-grained paired repeat execution, and dependency on Promptfoo's internal execution state.

2. **Option 2: Completely independent tool with no interop.**
   - Ignore existing Promptfoo suites.
   - *Drawbacks:* High barrier to adoption for engineering teams with existing Promptfoo YAML suites.

3. **Option 3: Independent runner with bidirectional configuration interop.**
   - Build a custom, content-addressed evaluation engine with structural reproducibility and statistical rigour at its core.
   - Support import and export of a documented subset of `promptfooconfig.yaml` files.

## Decision
We choose **Option 3**: `llm-evalboard` is an **independent evaluation engine, not a Promptfoo wrapper**.

Key differentiators:
1. **Statistical Honesty as the Product:** Paired comparisons, cluster bootstrap resampling over cases, four-way verdicts (BETTER, WORSE, NO MEANINGFUL DIFFERENCE, INCONCLUSIVE) with explicit smallest effect of interest ($\delta$), and sample size estimation.
2. **Judge Calibration:** Rigorous calibration of LLM judges against human labels (weighted Cohen's kappa, position-swap bias mitigation, inconsistency detection, and trust badges).
3. **Production-to-Test Flywheel:** Ingesting production traces with PII redaction and promoting failures into immutable dataset versions.
4. **Interoperability:** Providing clean import and export adapters for documented Promptfoo configuration subsets, enabling frictionless onboarding without runtime lock-in.

## Consequences
- Full architectural freedom to enforce content-addressed immutability and variance decomposition across repeated case runs.
- Clear documentation required (`docs/promptfoo-mapping.md`) mapping supported versus unsupported Promptfoo features with explicit warnings when importing non-mappable configurations.

