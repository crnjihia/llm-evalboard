# Architectural Decision Records (ADRs)

This directory documents key architectural decisions made in `llm-evalboard`. Each ADR captures context, alternatives considered, decision outcomes, and consequences.

---

## Index of Architectural Decisions

| ADR | Title | Status | Date | Summary |
| :--- | :--- | :--- | :--- | :--- |
| [ADR-001](./ADR-001-stack-and-tooling.md) | Technology Stack and Monorepo Tooling | **Accepted** | 2026-11-07 | Adopted TypeScript strict monorepo with `pnpm`, Biome linting/formatting, Vitest, Next.js 15, and Drizzle ORM. |
| [ADR-002](./ADR-002-promptfoo-relationship.md) | Promptfoo Relationship and Compatibility Philosophy | **Accepted** | 2026-11-07 | Established relationship with Promptfoo: drop-in config compatibility, shadow mode, and non-destructive import/export while upgrading statistical rigor. |
| [ADR-003](./ADR-003-content-addressed-immutability.md) | Content-Addressed Immutability & Caching | **Accepted** | 2026-11-08 | Implemented canonical SHA-256 DAG identification for prompts, datasets, graders, and runs to guarantee zero redundant LLM API calls. |
| [ADR-004](./ADR-004-pareto-frontier-under-uncertainty.md) | Pareto Frontier Identification Under Uncertainty | **Accepted** | 2026-11-08 | Established probabilistic Pareto dominance (Cost vs Quality, Latency vs Quality) considering bootstrap confidence intervals. |
| [ADR-005](./ADR-005-dashboard-auth-strategy.md) | Web Dashboard Authentication Strategy | **Accepted** | 2026-11-08 | Defined local-first, zero-auth development experience with clean session-token expansion for hosted team deployments. |
| [ADR-006](./ADR-006-flywheel-and-trace-promotion.md) | Production Flywheel and Trace Promotion Architecture | **Accepted** | 2026-11-08 | Implemented multi-stage PII scrubbing, MinHash deduplication, synthetic variation generation, and promotion of production traces to test suites. |
| [ADR-007](./ADR-007-security-red-teaming-taxonomy.md) | Security Red-Teaming Taxonomy and Scoring | **Accepted** | 2026-11-08 | Standardized red-teaming taxonomy on OWASP Top 10 for LLMs, multi-turn adaptive attacker loop, and Wilson score ASR with 95% CIs. |
| [ADR-008](./ADR-008-promptfoo-migration-and-compatibility.md) | Promptfoo Migration, Compatibility, & Shadow Execution | **Accepted** | 2026-11-08 | Built bidirectional Promptfoo configuration importer/exporter and Shadow Execution Mode for detecting single-run "False Passes". |
| [ADR-009](./ADR-009-ci-merge-gating-and-observability.md) | CI Merge Gating and Observability Integrations | **Accepted** | 2026-11-08 | Implemented GitHub Action CI runner, PR sticky comment bot with ASCII forest plots, merge gatekeeper, and OpenTelemetry / Langfuse export. |
