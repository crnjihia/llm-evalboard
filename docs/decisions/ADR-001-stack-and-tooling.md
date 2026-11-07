# ADR-001: Core Stack and Monorepo Tooling Choices

## Status
Accepted

## Context
`llm-evalboard` is a statistically honest evaluation framework and dashboard for LLM features. It requires a monorepo setup capable of managing shared domain types, a statistical engine, database repositories, provider integrations, CLI, worker, and web dashboard. We need predictable, fast development tooling with strict type safety, fast linting, and minimal maintenance friction across platforms.

## Options Considered

1. **Linter / Formatter:**
   - *Option A: ESLint + Prettier.* The traditional standard in the TypeScript ecosystem. However, it often suffers from plugin configuration bloat, slow lint cycles in monorepos, and frequent version incompatibilities between plugins.
   - *Option B: Biome (`@biomejs/biome`).* A unified, Rust-based toolchain providing fast formatting and linting. It natively understands TypeScript, JSX, and JSON, with zero plugin drift and instantaneous CI checks.

2. **Package Manager & Workspace:**
   - *Option A: npm / yarn workspaces.* Slower dependency resolution, less strict dependency isolation.
   - *Option B: pnpm workspaces.* Highly efficient disk utilization with content-addressable storage, strict dependency resolution preventing phantom dependencies, and first-class workspace protocol support (`workspace:*`).

3. **Database & ORM:**
   - *Option A: Prisma.* Heavy runtime engine and schema generation overhead.
   - *Option B: Drizzle ORM.* Lightweight, SQL-like TypeScript ORM with schema-driven migrations, zero binary dependencies, excellent edge/Node compatibility, and direct SQL control.

4. **Testing Framework:**
   - *Option A: Jest.* Requires ts-jest / babel transforms, slower in modern ESM monorepos.
   - *Option B: Vitest.* Native ESM and TypeScript support, high performance, shared Vite ecosystem configuration, compatible with in-source and integration testing.

## Decision
- **Toolchain:** Adopt **Biome** for all linting and code formatting across the repository.
- **Workspace:** Adopt **pnpm** workspaces with a strict workspace layout.
- **Runtime & Language:** Target Node.js LTS (v22+) with TypeScript in `strict` mode, `noUncheckedIndexedAccess: true`, and ES2022 module resolution.
- **Database:** PostgreSQL managed via Drizzle ORM with SQL migrations.
- **Testing:** Vitest for unit and integration testing.

## Consequences
- Fast CI runs and local iteration times (Biome checks run in milliseconds).
- Single source of truth for code style without conflicting Prettier/ESLint configs.
- Strict type boundaries across all package borders, preventing unchecked property access and implicit `any`.

