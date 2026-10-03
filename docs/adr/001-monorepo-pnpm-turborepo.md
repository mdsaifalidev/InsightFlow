# ADR-001: Monorepo with pnpm + Turborepo

**Status:** Accepted · 2026-09-21

## Context
Three deployables (web, auth-node, data-py) share API contracts. There is one developer. Changes often cross service boundaries, for example adding a field end to end.

## Decision
Use a single repo with **pnpm workspaces + Turborepo** for the TypeScript packages. The Python service uses **uv** and is exposed to Turborepo through `package.json` script wrappers. Shared generated types live in `packages/api-types`.

## Consequences
- One PR can change the API, the types, and the UI together. Turborepo caches builds and tests.
- One `docker-compose.yml` and one CI pipeline.
- The Python tooling sits partly outside the JS toolchain, which needs thin wrapper scripts.
