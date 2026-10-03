# ADR-003: Drizzle instead of Prisma

**Status:** Accepted · 2026-09-21

## Context
The original idea specified Prisma. The Node service must own only the `auth` Postgres schema, next to a Python-owned `analytics` schema, and should ship a small Docker image.

## Decision
Use **Drizzle ORM + drizzle-kit** migrations scoped to `pgSchema('auth')`.

## Consequences
- SQL-first, type-safe queries with no query-engine binary, so images are smaller and cold starts faster.
- First-class Postgres schema support keeps migrations isolated from Alembic's `analytics` schema.
- Less "magic" than Prisma (relations are explicit). Prisma is more recognizable on a resume, but that is outweighed by the fit.
