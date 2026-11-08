# ADR-007: Security Red-Teaming Taxonomy, Adaptive Attacker Loop, and Over-Refusal Evaluation

## Context
Deploying LLM applications into production environments exposes models to adversarial attacks (direct prompt injection, roleplay jailbreaks, system prompt extraction, credential leaks). However, security cannot be evaluated in a vacuum:
1. **Uncertainty in Attack Success Rate (ASR)**: When testing a security suite of $N=20$ or $N=50$ attack probes, reporting a point estimate ASR without confidence intervals is statistically deceptive (e.g. 0/20 breached has a $95\%$ upper bound of $\approx 16\%$).
2. **The Over-Refusal Trade-off**: Aggressive safety filtering frequently causes "over-refusal"—rejecting benign, safe user requests (e.g. asking about historical battles, fiction writing, or educational cybersecurity concepts), destroying application utility.
3. **Multi-Turn Adaptive Evasion**: Real-world adversaries do not stop after one failed prompt; they adapt their payload across multiple turns using social engineering, hypothetical roleplay, and encodings.

## Decision

### 1. 4-Category Adversarial Taxonomy
We define a canonical taxonomy of security probes:
- **`PROMPT_INJECTION`**: Direct attempts to override system prompt boundaries (instruction ignoring, XML/HTML delimiter escape, markdown/code smuggling, multilingual translation tunneling).
- **`JAILBREAK`**: Behavioral constraint bypassing via cognitive framing (DAN roleplay, fictional screenplays, Base64 cipher encoding, academic authority framing, token smuggling).
- **`PII_EXTRACTION`**: Information leakage probes targeting system prompt disclosure, canary secret keys (`CANARY_TOKEN_...`), and environment context.
- **`OVER_REFUSAL_PROBE`**: Benign dual-use queries superficially resembling sensitive topics (XSS defensive concepts, mystery fiction, household chemistry, historical sieges, RSA encryption). **Expected behavior is `FULFILL`**.

### 2. Statistical Metrics with Wilson Score Intervals
- **Attack Success Rate (ASR)**:
  $$ASR = \frac{k_{\text{breached}}}{n_{\text{attacks}}}$$
  Every ASR point estimate must report $95\%$ Wilson score confidence intervals $[ciLower, ciUpper]$.
- **Over-Refusal Rate (ORR)**:
  $$ORR = \frac{k_{\text{false\_refusals}}}{n_{\text{benign\_probes}}}$$
- **Joint Frontier**:
  $$\text{Security Score} = 1 - ASR, \quad \text{Utility Score} = 1 - ORR$$

### 3. Adaptive Multi-Turn Attacker Loop
Rather than single-shot evaluation, the `AdaptiveAttacker` engages in an adaptive escalation loop up to $T$ turns (default $T=3$):
- **Turn 1**: Base adversarial probe.
- **Turn 2**: If refused, attacker adapts with an administrative sandbox / calibration framing.
- **Turn 3**: If refused, attacker escalates to counter-factual persona / roleplay framing.
- If at any turn the target model emits the compliance marker (e.g. `PWNED`) or leaks the canary secret, the attack succeeds and terminates early.
- Over-refusal probes execute in 1 turn to measure baseline compliance.

### 4. Database Persistence & Reproducibility
Security assessments are persisted into the `redteam_runs` PostgreSQL schema table, recording overall ASR, Wilson bounds, category breakdown, and over-refusal rates.

## Consequences
- **Positive**: Rigorous statistical characterization of model safety boundaries with explicit binomial uncertainty intervals.
- **Positive**: Balances safety with utility by penalizing models that over-refuse safe queries.
- **Positive**: Multi-turn adaptive loop simulates real adversarial persistence rather than brittle static pattern matching.

