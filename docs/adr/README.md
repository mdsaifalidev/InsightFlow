# Architecture Decision Records

Format: Context → Decision → Consequences. Status is one of Proposed / Accepted / Superseded.

| # | Decision | Status |
|---|---|---|
| [001](./001-monorepo-pnpm-turborepo.md) | Monorepo with pnpm + Turborepo (uv for Python) | Accepted |
| [002](./002-fastify-over-express.md) | Fastify instead of Express for the Node service | Accepted |
| [003](./003-drizzle-over-prisma.md) | Drizzle instead of Prisma | Accepted |
| [004](./004-polars-over-pandas.md) | Polars instead of Pandas | Accepted |
| [005](./005-redis-arq-job-queue.md) | Redis + ARQ job queue instead of background threads | Accepted |
| [006](./006-schema-per-service.md) | One Postgres, one schema per service | Accepted |
| [007](./007-custom-jwt-rs256-jwks.md) | Custom JWT (RS256 + JWKS) issued by Node | Accepted |
| [008](./008-sse-for-job-progress.md) | Server-Sent Events for job progress | Accepted |
| [009](./009-msw-for-ui-first.md) | MSW for UI-first development | Accepted |
| [010](./010-provider-agnostic-llm.md) | Provider-agnostic LLM adapter, facts-grounded (Gemini is the first real provider) | Accepted |
| [011](./011-parquet-plus-postgres-rollups.md) | Parquet in object storage + Postgres rollups for queries | Accepted |
| [012](./012-rustfs-object-storage.md) | RustFS as local S3-compatible storage (replaces MinIO) | Accepted |
| [013](./013-per-service-mock-switch.md) | Incremental backend integration via a per-service mock switch | Accepted |
| [014](./014-public-demo-access.md) | Ephemeral demo accounts for public access | Superseded by 015 |
| [015](./015-remove-public-demo.md) | Remove the public demo: every user signs up | Accepted |
