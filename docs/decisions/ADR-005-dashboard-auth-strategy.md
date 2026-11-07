# ADR-005: Self-Hosted Dashboard Authentication Strategy

## Status
Accepted

## Context
`llm-evalboard` is an open-source, self-hosted evaluation tool designed for internal engineering teams, pair programmers, and CI runners. Non-goals explicitly rule out building a hosted multi-tenant SaaS product. Teams deploy `llm-evalboard` locally on developer machines, as a service in Docker Compose, or inside private VPCs.

We require an authentication strategy that:
1. Imposes zero friction during local development and testing.
2. Secures self-hosted deployments against unauthorized access without requiring external identity providers (OAuth2, Auth0, Okta) or database-backed multi-tenant user accounts.
3. Allows programmatic API access for CI workflows and CLI commands.

## Options Considered

1. **Option 1: No Authentication (Completely Open).**
   - *Pros:* Zero friction.
   - *Cons:* Vulnerable when exposed on a shared network, VPN, or company intranet.

2. **Option 2: Complex Multi-User RBAC with Database Sessions.**
   - *Pros:* Per-user auditing.
   - *Cons:* Heavy operational overhead, database bloat, password reset flows, and contrary to the project's single-tenant scope.

3. **Option 3: Shared Access Token with Local Dev Bypass (Adopted).**
   - *Mechanism:*
     - A single shared secret token is defined via the `EVALBOARD_API_TOKEN` environment variable.
     - When `NODE_ENV=development` or `EVALBOARD_API_TOKEN` is unset/empty, authentication is automatically bypassed for instant local usability.
     - When `EVALBOARD_API_TOKEN` is set, API routes and dashboard pages require authentication via `Authorization: Bearer <token>` header (for CLI/CI) or an `evalboard_auth` cookie set via a minimal login page.
   - *Pros:* Zero setup locally; secure in shared deployments; easy to rotate via container environment variables.

## Decision
We adopt **Option 3: Shared Access Token with Local Dev Bypass**:
1. Default behavior: if `EVALBOARD_API_TOKEN` is not set or in development mode, access is unrestricted.
2. When `EVALBOARD_API_TOKEN` is set, API middleware and page guards enforce token matching.
3. The dashboard UI presents a clean, minimalist token entry modal/page that sets the token into a cookie.
4. Programmatic requests from the CLI and GitHub Action supply the token via the standard `Authorization: Bearer <token>` HTTP header.

## Consequences
- Developers get immediate out-of-the-box functionality (`docker compose up`, `pnpm dev`).
- Production and staging deployments inside internal infrastructure are securely gated with a single environment variable.
- Minimal codebase footprint with zero third-party auth service dependencies.

