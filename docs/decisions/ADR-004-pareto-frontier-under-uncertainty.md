# ADR-004: Cost-vs-Quality Pareto Frontier Classification under Statistical Uncertainty

## Status
Accepted

## Context
When comparing multiple candidate prompt versions or model providers (e.g. Claude 3.5 Sonnet vs. Haiku vs. Ollama Llama 3), teams face a trade-off between monetary cost per evaluation run and output quality. In classical multi-objective optimisation, point estimates are evaluated for Pareto dominance: point $A$ dominates point $B$ if $Cost_A \le Cost_B$ and $Quality_A \ge Quality_B$ with at least one strict inequality.

However, in LLM evaluation, quality is not a deterministic scalar; it is a statistical estimate subject to sampling variance and run-to-run model stochasticity, represented by a confidence interval $[L, U]$. If candidate $A$ has a slightly higher mean score than $B$ at equal cost, but their confidence intervals overlap substantially ($L_A < U_B$), declaring $A$ as dominating $B$ gives a false sense of certainty. Conversely, ignoring uncertainty would prematurely discard valid cost-effective alternatives.

## Options Considered

1. **Option 1: Naive Point-Estimate Pareto Frontier.**
   - Evaluate dominance strictly based on sample means $\bar{y}$.
   - *Drawback:* Statistically dishonest. High-variance small-sample runs appear on the frontier simply due to lucky draws, while reliable lower-variance configurations are discarded.

2. **Option 2: Pessimistic Min-Max Dominance (Strict Non-Overlapping Intervals Only).**
   - Point $A$ dominates $B$ only if $Cost_A \le Cost_B$ AND $L_A \ge U_B$.
   - *Drawback:* Overly conservative. When test sample sizes are moderate, confidence intervals overlap slightly even when one model is substantially better, causing nearly all candidates to remain on the frontier and providing no guidance to users.

3. **Option 3: Three-Tiered Pareto Classification under Uncertainty (Adopted).**
   - Partition candidate points into three statistically honest categories:
     - **`ON_FRONTIER`**: Definitively non-dominated configurations. No cheaper alternative achieves comparable or superior quality.
     - **`UNCERTAIN`**: Plausible contenders whose point estimates are dominated by a cheaper or equal-cost candidate, but whose confidence intervals overlap with frontier points ($L_A < U_B$). They cannot be conclusively eliminated without more test cases.
     - **`DOMINATED`**: Definitively inferior configurations where a cheaper alternative's lower bound strictly exceeds their upper bound ($Cost_A \le Cost_B$ and $L_A \ge U_B$, with strict inequality).

## Decision
We adopt **Option 3: Three-Tiered Pareto Classification under Uncertainty**:
1. All candidates are evaluated pairwise across cost and quality confidence intervals $[L, U]$.
2. Points are categorized as:
   - `ON_FRONTIER`: Non-dominated configurations defining the efficient boundary.
   - `UNCERTAIN`: Configurations where point estimate is lower than a cheaper point, but overlapping uncertainty intervals preclude definitive rejection.
   - `DOMINATED`: Configurations conclusively superseded across the entire uncertainty interval.
3. Every Pareto visualization and CLI output displays quality error bars ($95\%$ CI) and explicitly labels `UNCERTAIN` candidates alongside recommended sample sizes needed to resolve ambiguities.

## Consequences
- Prevents engineering teams from making expensive architectural decisions based on noise.
- Transparently distinguishes between proven cost-quality trade-offs and statistically ambiguous results.
- Feeds directly into power analysis: users can click on an `UNCERTAIN` configuration to see how many additional test cases are needed to prove whether it belongs on the frontier.

