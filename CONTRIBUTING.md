# Contributing to `llm-evalboard`

Thank you for contributing to `llm-evalboard`. We hold high engineering and statistical standards to ensure every evaluation result is reproducible and statistically sound.

---

## 1. Development Principles

1. **Statistics are the product:** Never present a difference between two prompts or models without its uncertainty.
2. **Reproducibility is structural:** Configs, prompts, datasets, and graders are immutable and content-addressed.
3. **TypeScript Strict:** No unchecked indexing, no unannotated `any`.
4. **Zod at boundaries:** Validate every external boundary (file configs, API payloads, provider outputs).
5. **Conventional Commits:** Use standard conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).

---

## 2. Setup & Workflow

### Prerequisites
- Node.js LTS (v22+)
- `pnpm` (v12+)
- Docker & Docker Compose (for PostgreSQL)

### Initial Setup
```bash
# Install dependencies
pnpm install

# Start local PostgreSQL
pnpm db:up

# Run tests
pnpm test

# Check types and linting
pnpm typecheck
pnpm lint
```

---

## 3. Pull Request Guidelines

- Ensure `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass cleanly before submitting.
- Write unit tests for new statistical calculations, graders, or provider adapters.
- All non-obvious architecture or statistical design choices should be accompanied by an ADR in `docs/decisions/`.

