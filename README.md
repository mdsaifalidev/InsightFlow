# InsightFlow

Upload a CSV or XLSX file and get an interactive dashboard plus a grounded AI executive summary. A portfolio project that shows polyglot microservice design: Next.js, Node.js (Fastify), Python (FastAPI + Polars), PostgreSQL, Redis, and S3.

- **Product scope:** [docs/PRD.md](docs/PRD.md)
- **Architecture:** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Decisions:** [docs/adr/](docs/adr/)

## Status

| Phase | | |
|---|---|---|
| 0 | PRD, architecture, ADRs | ✅ |
| 1 | Monorepo + Docker stack | ✅ |
| 2 | Full UI on MSW mocks | ✅ |
| 3 | Node auth service | ✅ |
| 4 | Python data service + AI | ✅ |
| 5 | Typed contracts, CI, real-stack E2E | ✅ |
| 6 | Landing page, screenshots | ✅ |
| 6c | Design tokens, band rhythm, file-to-dashboard hero | 🔄 in progress |
| 7 | Deployment | ⏳ |

## Measured performance

Numbers from `infra/benchmarks/RESULTS.md` — measured, never estimated. A 1M-row,
86.7 MB CSV (12 columns) on a 2-core i7-6600U laptop, against the **dev** containers
(reload watchers, bind mounts, a single uvicorn process): the pessimistic case.

| | Measured | Target |
|---|---|---|
| Upload → `202`, server time after the last byte | **14–19 ms** | < 1 s |
| Upload complete → dashboard ready | **12.0–12.5 s** (14.2–15.0 s incl. the brief) | < 30 s |
| Filtered dashboard query, 6 widgets + KPIs | **p50 280 ms, p95 368–377 ms** | p95 < 500 ms |

The p95 target is met without pre-aggregated rollups, so [ADR-011](docs/adr/011-parquet-plus-postgres-rollups.md)'s
`metric_rollups` table stays deferred. What the tuning was worth:

- streaming the upload to S3 in 8 MB parts as it arrives, instead of spooling it first — time after the last byte **1428–1490 ms → 14–174 ms**
- evaluating type-inference rules in order behind cheap prefix checks, instead of every test on every column — dashboard ready **17.0–17.5 s → 11.7–12.5 s**
- grouping on truncated timestamps, single-pass masked KPI windows, and no Date → Datetime cast when filtering — query p95 **631 ms → 368–377 ms**

Re-run them yourself: `gen_large.py`, `ingest_bench.py`, `query_bench.py` in [infra/benchmarks](infra/benchmarks/).

## Prerequisites

Node 24+, pnpm 12+, Docker (Compose v2+). Later phases also need Python 3.13+ and uv.

## Getting started

```bash
cp .env.example .env
pnpm install
```

**Option A: everything in Docker**

```bash
pnpm stack:up        # open http://localhost:8080
pnpm stack:logs
pnpm stack:down
```

**Option B: web app native (fastest hot reload), infra in Docker**

```bash
pnpm infra:up        # postgres, redis, rustfs (+ buckets)
pnpm dev             # open http://localhost:3000
```

Both modes run against the real auth and data services. Each backend area can be switched back to MSW mocks independently ([ADR-013](docs/adr/013-per-service-mock-switch.md)): `NEXT_PUBLIC_AUTH_MODE` / `NEXT_PUBLIC_DATA_MODE` = `service` (default) or `mock`.

| URL | What |
|---|---|
| http://localhost:8080 | Gateway (nginx) → web, `/api/auth`, `/api/data` |
| http://localhost:3000 | Web app directly |
| http://localhost:9001 | RustFS console (`rustfsadmin` / `rustfsadmin`) |
| `localhost:5432` | Postgres (`insightflow` / `insightflow`) |

## Monorepo

```
apps/web                    Next.js 16 (App Router) + shadcn/ui + MSW
services/auth-node          Fastify + Drizzle + RS256 JWT/JWKS
services/data-py            FastAPI + Polars + ARQ worker (uv)
packages/api-types          Both OpenAPI specs + the TS types generated from them
packages/ui                 Shared shadcn components and Tailwind theme
packages/eslint-config      Shared lint config
packages/typescript-config  Shared tsconfig
infra/nginx                 Gateway config
infra/postgres/init         Schemas + per-service roles
infra/benchmarks            Load generators + measured results
docs/                       PRD, architecture, ADRs
```

## Testing

```bash
pnpm test                    # unit + integration (Vitest, pytest; Testcontainers needs Docker)
pnpm --filter web test:e2e   # Playwright against MSW
pnpm e2e:real                # Playwright against the real services in Docker
pnpm api-types               # regenerate the specs and types; a diff means the contract drifted
```

189 unit and integration tests (105 pytest with Testcontainers, 71 Vitest, 13 Vitest + Testcontainers)
plus two Playwright suites: one on MSW, one driving the whole analyst flow against the real services.

CI (`.github/workflows/ci.yml`) runs lint/format/typecheck/build/tests, the contract drift check, and both E2E suites — the real one against the services' production images. See [ARCHITECTURE §7](docs/ARCHITECTURE.md#7-testing-and-ci).
