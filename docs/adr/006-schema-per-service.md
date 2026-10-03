# ADR-006: One Postgres instance, one schema per service

**Status:** Accepted · 2026-09-21

## Context
Both services use Postgres, each with its own migration tool (drizzle-kit, Alembic). If both manage the same schema, they collide.

## Decision
Use a single Postgres instance with schemas **`auth`** (owned by Node) and **`analytics`** (owned by Python). Each service connects with its own DB role, which has write access only to its own schema. There are no cross-schema foreign keys: `analytics` stores `workspace_id` taken from the JWT.

## Consequences
- Clear ownership and independent migrations. Each schema could be split into its own database later.
- Deleting an account needs cross-service cleanup: the Node service publishes a `user.deleted` event on Redis, and Python purges the workspace data.
- A single instance is cheaper and simpler for local development and the demo.
