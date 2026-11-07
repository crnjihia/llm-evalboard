# Statistical Methodology & Evaluation Rigour

`llm-evalboard` is built on a central principle: **statistics are the product**. When evaluating LLM applications, prompt modifications or model changes frequently produce small shifts in score (e.g. +2% on a 50-item benchmark). In conventional evaluation tools, this is uncritically reported as an improvement, leading teams to ship spurious changes that degrade in production.

This document details the statistical foundations, mathematical formulas, and decision rules implemented in `@evalboard/stats`.

---

## 1. Unit of Analysis: The Test Case

> [!IMPORTANT]
> **Repeats of the same test case are not independent samples of the world.**

In LLM evaluation, running a stochastic model ($temperature > 0$) 3 times on test case $i$ does not produce 3 independent data points. It produces 3 correlated observations nested inside case $i$. Treating repeated runs as independent observations inflates the sample size (pseudoreplication) and produces spuriously narrow confidence intervals and falsely low p-values.

**Rule:** For any case $i$ evaluated across $m_i$ repeats, the case score is aggregated first:
$$\bar{y}_i = \frac{1}{m_i} \sum_{j=1}^{m_i} y_{ij}$$
All subsequent statistical comparisons, paired differences, effect sizes, and bootstrap resamplings operate over the vector of case means $\{\bar{y}_1, \dots, \bar{y}_k\}$, where $k$ is the number of distinct test cases in the dataset.

---

## 2. Repeated Runs & Variance Decomposition (ANOVA & ICC)

To understand whether variance stems from inherent test case difficulty or run-to-run model stochasticity, we apply a **One-Way Random-Effects ANOVA** (`computeRepeatsAnova`):

- **Between-case Sum of Squares ($SS_B$):**
  $$SS_B = \sum_{i=1}^k m_i (\bar{y}_i - \bar{y}_{\cdot\cdot})^2, \quad MS_B = \frac{SS_B}{k - 1}$$
- **Within-case Sum of Squares ($SS_W$):**
  $$SS_W = \sum_{i=1}^k \sum_{j=1}^{m_i} (y_{ij} - \bar{y}_i)^2, \quad MS_W = \frac{SS_W}{\sum m_i - k}$$
- **Variance Components:**
  $$\sigma^2_{\text{within}} = MS_W \quad \text{(run-to-run model noise)}$$
  $$\sigma^2_{\text{between}} = \max\left(0, \frac{MS_B - MS_W}{m_0}\right) \quad \text{(inherent case diversity)}$$
- **Intraclass Correlation Coefficient ($ICC$):**
  $$ICC = \frac{\sigma^2_{\text{between}}}{\sigma^2_{\text{between}} + \sigma^2_{\text{within}}}$$

### Repeat Recommendations
- **$ICC \ge 0.90$ (Noise $\le 10\%$):** Model is highly deterministic. **1–2 repeats** suffice; extra repeats waste API spend.
- **$0.70 \le ICC < 0.90$ (Noise $10\% - 30\%$):** Moderate stochasticity. Recommend **3–5 repeats** to average out token sampling variance.
- **$ICC < 0.70$ (Noise $> 30\%$):** High stochasticity. Recommend **5+ repeats** or lowering sampling temperature.

---

## 3. Four-Way Statistical Verdict Rules

Let $d = \bar{\text{Candidate}} - \bar{\text{Baseline}}$ be the point estimate of the paired difference, and $[L, U]$ be the $(1 - \alpha)$ percentile bootstrap confidence interval of the mean paired difference. Let $\delta$ be the **smallest effect of interest** (default $0.03$, or $3\%$ on a $0–1$ scale).

| Verdict | Mathematical Condition | Plain-Language Interpretation |
|---|---|---|
| **BETTER** | $L > 0$ and $d \ge \delta$ | Candidate reliably outperforms baseline; the lower bound exceeds 0 and the point estimate is clinically/practically meaningful ($\ge \delta$). |
| **WORSE** | $U < 0$ and $d \le -\delta$ | Candidate reliably degrades performance; the upper bound is below 0 and the regression is clinically meaningful ($\le -\delta$). |
| **NO MEANINGFUL DIFFERENCE** | $L > -\delta$ and $U < \delta$ | The entire confidence interval is contained strictly inside the equivalence zone $[-\delta, +\delta]$. The candidate is statistically proven to be practically indistinguishable from baseline. |
| **INCONCLUSIVE** | Anything else | Evidence is insufficient to distinguish the effect from noise (interval spans across the decision boundary). The system calculates the estimated additional cases needed. |

> [!NOTE]
> **"No meaningful difference" is a first-class success, not a failure.**
> When attempting to optimize prompts for latency, tokens, or cost, proving that quality did not degrade (equivalence within $\pm \delta$) is the desired goal.

---

## 4. Power Analysis & Sample Size Planning

When a comparison yields an **INCONCLUSIVE** verdict, `llm-evalboard` provides an immediate answer to: *"How many more cases do I need to reach a verdict?"*

Using the standard normal approximation for paired differences:
$$N_{\text{required}} = \left\lceil \frac{(z_{1 - \alpha/2} + z_{\text{power}})^2 \cdot \sigma_D^2}{\delta^2} \right\rceil$$
where:
- $\sigma_D$ is the sample standard deviation of paired differences ($s_D$).
- $\delta$ is the smallest effect of interest.
- $\alpha = 0.05 \implies z_{0.975} \approx 1.96$.
- $\text{power} = 0.80 \implies z_{0.80} \approx 0.8416$.

The additional cases needed is $\max(0, N_{\text{required}} - N_{\text{current}})$.

---

## 5. Proportions & Binary Outcomes (Wilson & McNemar)

### Wilson Score Interval
For pass rates, accuracy, and Attack Success Rates (ASR), the standard normal Wald interval ($p \pm 1.96 \sqrt{p(1-p)/n}$) fails catastrophically near boundaries ($p \approx 0$ or $p \approx 1$). We implement the **Wilson Score Interval** (`wilsonScoreInterval`):
$$\tilde{p} = \frac{p + \frac{z^2}{2n}}{1 + \frac{z^2}{n}}, \quad \text{Margin} = \frac{z}{1 + \frac{z^2}{n}} \sqrt{\frac{p(1-p)}{n} + \frac{z^2}{4n^2}}$$
$$[L, U] = [\max(0, \tilde{p} - \text{Margin}), \min(1, \tilde{p} + \text{Margin})]$$

### McNemar's Exact Test
When evaluating paired binary pass/fail outcomes between baseline and candidate:
- $b$: Baseline passed, Candidate failed.
- $c$: Baseline failed, Candidate passed.
- Discordant total: $n = b + c$.
- Exact two-sided binomial p-value (`mcnemarExactTest`):
  $$p = \min\left(1.0, 2 \sum_{i=0}^{\min(b,c)} \binom{n}{i} 0.5^n\right)$$

---

## 6. Multiple Comparison Corrections

When a benchmark evaluates multiple prompts or metrics simultaneously, testing each comparison at $\alpha = 0.05$ inflates the overall false discovery rate.

1. **Holm Step-Down Procedure (`adjustPValuesHolm`):**
   - Controls Family-Wise Error Rate (FWER $\le \alpha$).
   - Sort p-values ascending: $p_{(1)} \le \dots \le p_{(m)}$.
   - Adjusted p-value: $p_{(k)}^{\text{adj}} = \min\left(1, \max_{j \le k} \{(m - j + 1) p_{(j)}\}\right)$.
   - Strongly controls type-I error without the excessive conservatism of Bonferroni.
2. **Benjamini-Hochberg Procedure (`adjustPValuesBh`):**
   - Controls False Discovery Rate (FDR $\le q$).
   - Adjusted p-value: $p_{(k)}^{\text{adj}} = \min\left(1, \min_{j \ge k} \left\{\frac{m}{j} p_{(j)}\right\}\right)$.

---

## 7. Cost-vs-Quality Pareto Frontier under Uncertainty (ADR-004)

Candidates are mapped on a Cost (\$ USD) vs. Quality ($[L, U]$) space:
- **`ON_FRONTIER`**: Definitively non-dominated configurations defining the efficient frontier.
- **`UNCERTAIN`**: Plausible contenders whose point estimates are lower than cheaper options, but whose uncertainty intervals overlap ($L_A < U_B$).
- **`DOMINATED`**: Conclusively inferior options where a cheaper candidate's lower bound strictly exceeds their upper bound ($Cost_A \le Cost_B$ and $L_A \ge U_B$).

---

## 8. Change Detection & Regression Monitoring (EWMA)

For continuous integration and trend monitoring across recurring runs, we use an **Exponentially Weighted Moving Average (EWMA) Control Chart** (`detectRegressionsEwma`):
$$Z_t = \lambda X_t + (1 - \lambda) Z_{t-1}, \quad \lambda = 0.20$$
Time-varying control limits based on baseline historical variance $\sigma_0$:
$$UCL_t = \mu_0 + L \cdot \sigma_0 \sqrt{\frac{\lambda}{2 - \lambda} \left[1 - (1 - \lambda)^{2t}\right]}$$
$$LCL_t = \mu_0 - L \cdot \sigma_0 \sqrt{\frac{\lambda}{2 - \lambda} \left[1 - (1 - \lambda)^{2t}\right]}$$
A drop below $LCL_t$ ($L = 3$) immediately triggers a `critical` regression alert.

