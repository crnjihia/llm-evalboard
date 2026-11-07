# llm-evalboard

> **Statistically honest LLM evaluation framework and dashboard.**  
> Answers one question reliably: *"Is this prompt or model change a real improvement, or just noise?"*

---

## Highlights

- **Statistically Honest:** Paired comparisons, cluster bootstrap confidence intervals, variance decomposition across repeats, and four-way verdicts (**BETTER**, **WORSE**, **NO MEANINGFUL DIFFERENCE**, **INCONCLUSIVE**).
- **Structural Reproducibility:** Content-addressed prompts, datasets, and grader configurations (`sha256` of canonical representation). Zero paid provider calls on re-runs of unchanged inputs.
- **Judge Calibration:** Measure judge agreement with human labels using weighted Cohen's $\kappa$, position-swap bias mitigation, and visible trust badges.
- **Production-to-Test Flywheel:** Ingest production traces, redact PII automatically, and promote edge cases into immutable test suites.
- **Cost & Latency Pareto:** Direct cost vs quality and latency vs quality trade-off analysis.
- **Promptfoo Interoperability:** Clean import and export for standard Promptfoo configurations.

---

## Quickstart

### Prerequisites
- Node.js LTS (v22+)
- `pnpm` (v12+)
- Docker & Docker Compose

### 1. Install dependencies
```bash
pnpm install
```

### 2. Start PostgreSQL
```bash
pnpm db:up
```

### 3. Run Checks
```bash
# Run unit & package tests
pnpm test

# Check TypeScript types
pnpm typecheck

# Check formatting and linting
pnpm lint
```

---

## Architecture & Monorepo Structure

```
llm-evalboard/
├── packages/
│   ├── core/            # Domain types, config schema, runner, run orchestration
│   ├── providers/       # Anthropic, OpenAI-compatible (Ollama/OpenRouter), mock, cache
│   ├── graders/         # Exact match, regex, json-schema, numeric, llm-rubric, pairwise
│   ├── stats/           # Bootstrap, paired tests, verdicts, power estimation, Pareto
│   ├── db/              # Drizzle schema, migrations, repositories
│   ├── redteam/         # Attack templates, detectors, ASR reporting
│   ├── flywheel/        # Trace import, redaction, triage, promotion
│   ├── promptfoo-compat/# Import/export + mapping tests
│   └── cli/             # `evalboard` command
├── apps/
│   ├── web/             # Next.js dashboard + API routes
│   └── worker/          # pg-boss worker executing runs and scheduled jobs
├── action/              # GitHub Action (TypeScript, bundled)
├── conformance/         # Reference test vectors generated with SciPy / scikit-learn
└── docs/                # Architecture, methodology, decision records
```

---

## License

[MIT](LICENSE)

