# InsightFlow — Architecture

> Companion to [PRD.md](./PRD.md). Decisions and their rationale are recorded in [adr/](./adr/).

## 1. System Overview

```
                         ┌──────────────────────────┐
                         │  Browser (Next.js app)   │
                         └────────────┬─────────────┘
                                      │ HTTPS
                         ┌────────────▼─────────────┐
                         │   Nginx API Gateway      │  rate limits · 100MB body · SSE passthrough
                         └──┬──────────┬─────────┬──┘
                /           │          │         │  /api/data/*
        ┌───────▼──────┐ ┌──▼─────────────┐ ┌────▼───────────────┐
        │ web          │ │ auth-node      │ │ data-py (FastAPI)  │
        │ Next.js SSR  │ │ Fastify+Drizzle│ │ Polars · SSE · API │
        └──────────────┘ └──┬─────────────┘ └──┬───────┬─────────┘
                            │ schema: auth     │       │ enqueue / pub-sub
                            │                  │   ┌───▼───────┐    ┌──────────────┐
                            │                  │   │  Redis    │◄──►│ data-worker  │
                            │                  │   └───────────┘    │ ARQ + Polars │
                            │                  │                    │ LLM adapter  │
                         ┌──▼──────────────────▼──┐                 └──┬────────┬──┘
                         │      PostgreSQL        │◄───────────────────┘        │
                         │  auth.*  │ analytics.* │                             │
                         └────────────────────────┘          ┌──────────────────▼─┐
                                                             │ RustFS (S3)        │
                                                             │ raw/ · parquet/    │
                                                             └────────────────────┘
```

## 2. Services

| Service | Tech | Responsibility | Owns |
|---|---|---|---|
| `web` | Next.js (App Router), shadcn/ui, TanStack Query, MSW | UI, RSC data loading, route protection | — |
| `gateway` | Nginx | Path routing, body limits, rate limiting, request IDs, SSE buffering off | — |
| `auth-node` | Fastify, Drizzle, argon2, jose | Users, sessions, JWT issuing, JWKS, audit logs | Postgres schema `auth` |
| `data-py` | FastAPI, Polars, SQLAlchemy, Alembic | Upload intake, dataset/query/widget/insight APIs, SSE | Postgres schema `analytics`, S3 buckets |
| `data-worker` | ARQ, Polars, LLM SDKs | Ingest pipeline, rollups, auto-dashboard, AI insights | (same codebase as `data-py`) |
| `postgres` | PostgreSQL 17 | Relational state | — |
| `redis` | Redis 7 | ARQ queue, job progress pub/sub, rate-limit counters | — |
| `rustfs` | RustFS ([ADR-012](./adr/012-rustfs-object-storage.md)) | Raw uploads and Parquet (S3 API; R2/S3 in prod) | — |

## 3. Key Flows

### 3.1 Authentication
1. `POST /api/auth/login` → Fastify verifies the Argon2id hash → signs an **RS256 access JWT** (15 min, claims `sub`, `wid` for workspace_id, `exp`) and sets a rotating **refresh cookie**.
2. The web client stores the access token in memory only. On a 401, it calls `/api/auth/refresh` once and retries.
3. Refresh tokens rotate on every use and are stored as SHA-256 hashes. Replaying a rotated token revokes its whole family. The service also sets an `if_session` indicator cookie on `/`, which lets Next's `proxy.ts` redirect `/app/*` server-side (the refresh cookie itself is scoped to `/api/auth`).
4. Deleting an account publishes `events:user.deleted` (`{ userId, workspaceId }`) on Redis for the data service to clean up (ADR-006).
6. `data-py` verifies JWTs locally with the public key fetched from `/api/auth/.well-known/jwks.json` (cached, with refresh on unknown `kid`). The services make no synchronous calls to each other.

### 3.2 Upload → Ready
```
web ──multipart──► data-py ──8 MB parts, while receiving──► S3 raw/{wid}/{datasetId}.{csv|xlsx}
                     │ insert datasets(status=queued), jobs
                     │ enqueue ARQ "ingest_dataset"
                     └─► 202 {dataset, jobId}   (~20 ms after the last byte)
web ──SSE /jobs/{jobId}/events──► data-py ◄── Redis pub/sub channel job:{jobId}
data-worker (ingest_dataset):
  queued → parsing (Polars CSV / fastexcel XLSX, all strings; normalize names)
  → profiling (infer types → typed Parquet → column profiles)
  → building_dashboard (auto widget rows) → generating_insight (facts → LLM → validate)
  → status=ready
  each stage: UPDATE jobs (seq+1) and PUBLISH job:{jobId} {id, event, data}
  retries: 3 tries with backoff; each run starts clean (idempotent per job)
```

### 3.3 Dashboard Query
- The `POST /datasets/{id}/query` body holds N widget specs plus the shared filters.
- Every widget runs as Polars over the dataset's typed frame: the Parquet file (cached on local disk) read into an in-process LRU keyed by the Parquet object key. The `metric_rollups` planner is deferred: queries meet the p95 target without it ([ADR-011](./adr/011-parquet-plus-postgres-rollups.md) amendment).
- All widgets run in one request, so the filter bar needs one round trip.

### 3.4 AI Insight
1. **Facts engine (Polars, `app/engine/facts.py`):** total, the strongest period-over-period change with its driving category, robust z-score anomalies (with a driver for strong ones) and the top category's share. Every fact has an id and, where it lives on a chart, a `ref` to the widget and point.
2. **LLM adapter** (`app/llm/`: `mock` for dev, tests and CI, `gemini` for real narration) turns the facts plus a template draft into a summary, findings and next questions, through the prompt in `app/llm/prompt.py`. Text cites numbers only as `{{factId}}`.
3. **Validator** (`app/engine/narrative.py`): numbers outside `{{factId}}` references and dates are ungrounded, in the summary, the findings and the questions alike. Three attempts share one budget — an ungrounded answer is retried with the offending numbers as feedback, and a timeout or 5xx costs one attempt — then ungrounded sentences are dropped. A permanent error, or a brief with nothing left, falls back to the template. Runs inside the ingest job ([ADR-010](./adr/010-provider-agnostic-llm.md) addendum).
4. **Regenerate:** `POST /insights` queues a one-stage job, limited to 5 per dataset per sliding hour (Redis sorted set).

## 4. Frontend Architecture

- **Two surfaces:** `/` is a static marketing page (route group `(marketing)`, no auth, no sidebar); `/app/*` is the product, behind `proxy.ts` and `AuthGate`. Product screenshots on the landing page are captured by a committed Playwright script, not hand-made.

- **Rendering:** RSC for page shells and first data load. Client components for charts, filters, and the table. Suspense streaming per widget.
- **Data layer:** a typed API client generated from OpenAPI (`packages/api-types`) and wrapped in TanStack Query hooks (`useDatasets`, `useDashboardQuery`, …).
- **Mocks:** MSW handlers in `apps/web/mocks/handlers/` mirror the PRD §9 contract exactly. `NEXT_PUBLIC_API_MOCKING=enabled` turns them on. SSE is mocked with a `ReadableStream` that emits stage events.
- **State:** server state lives in TanStack Query. Filter state lives in the URL (`nuqs`). Minimal client state otherwise.
- **UI kit:** shadcn/ui (sidebar, card, dialog, dropdown, command, table, chart, sonner, form), Tailwind v4 CSS variables for light and dark themes, `next-themes`.
- **Forms:** react-hook-form + zod.

## 5. Monorepo Layout

```
apps/web/                  Next.js app
services/auth-node/        Fastify service (TypeScript)
services/data-py/          FastAPI app + ARQ worker (uv-managed Python)
packages/api-types/        Generated TS types from both OpenAPI specs
packages/ui/               Shared shadcn/ui components, hooks, globals.css (Tailwind v4 theme)
packages/eslint-config/    Shared ESLint configs
packages/typescript-config/ Shared tsconfig bases
infra/nginx/               Gateway config
infra/benchmarks/          k6, Lighthouse, EXPLAIN, pytest-benchmark
docs/                      PRD, architecture, ADRs
```

Contract types: `packages/api-types` holds both services' OpenAPI specs and the TypeScript generated from them (`pnpm api-types`). Specs and types are committed, so CI can fail on drift (PRD §7), and `apps/web/lib/api/contract.ts` ties the hand-written client types to them at compile time.

Tooling: **pnpm workspaces + Turborepo** for JS/TS. **uv** for Python dependency and venv management. Turborepo wraps the Python tasks through `package.json` scripts so `turbo run test` covers everything.

## 6. Local Development (Docker)

- `docker compose up` starts all services. Source is bind-mounted with hot reload (`next dev`, `tsx watch`, `uvicorn --reload`, ARQ under `watchfiles`).
- Health checks gate dependencies: Postgres, Redis, and RustFS must be healthy before the app services start. A one-shot `rustfs-init` container creates the buckets.
- `http://localhost:8080` goes to the gateway (port 8080 because XAMPP's Apache usually owns :80; every host port is overridable in `.env`). The RustFS console is at `http://localhost:9001`.
- In Docker, the web container runs `next dev --webpack` with polling (`dev:docker` script), because Turbopack can't poll and bind mounts from Windows/macOS hosts don't deliver file events. Native `pnpm dev` uses Turbopack.
- Postgres volumes are named by major version (`pgdata17`), since data directories don't work across major versions.
- `pnpm infra:up` starts only Postgres, Redis, and RustFS, so the apps can run natively with `pnpm dev` (fastest hot reload): web, auth-node, and data-py (`scripts/dev.py`: migrations, API and worker, with localhost defaults from `services/data-py/.env.development`). Don't also run the Docker app services (ports 3000/4000/8000).
- Each backend area can use the real service or MSW ([ADR-013](./adr/013-per-service-mock-switch.md)): `NEXT_PUBLIC_AUTH_MODE` and `NEXT_PUBLIC_DATA_MODE` are `service` in dev and Docker, `mock` in Vitest and Playwright. Requests go through nginx in Docker and through Next rewrites (`AUTH_SERVICE_URL`, `DATA_SERVICE_URL`) natively. With both in service mode MSW doesn't start.
- `data-py` (FastAPI, :8000) syncs its uv venv (volume `data_venv`), runs Alembic, then `uvicorn --reload`; `data-worker` shares the venv and runs ARQ under `watchfiles`. Parquet is cached in the `data_cache` volume shared by both.
- `auth-node` runs its Drizzle migrations on start, then `tsx watch`. Dev signing keys are generated on first boot into the `auth_keys` volume. Natively, `pnpm infra:up` + `pnpm dev` runs web and auth-node together. Don't also run the Docker `auth-node` (both use :4000).

## 7. Testing and CI

Four layers, each guarding a different seam:

| Layer | What it covers |
|---|---|
| Unit / integration | Vitest + Testing Library (web), Vitest + Testcontainers (auth-node), pytest + Testcontainers + moto (data-py) |
| Engine parity | `services/data-py/tests/golden/*.json` are the TS mock engine's output on the sample CSVs; the Python engine must reproduce them |
| Contract | `pnpm api-types` regenerates the committed specs and types; a diff is a failure, and `apps/web/lib/api/contract.ts` fails `typecheck` on drift |
| End to end | `apps/web/e2e/analyst-flow.spec.ts` on MSW (fast), `apps/web/e2e/real-stack.spec.ts` on the real services |

The real-stack suite runs the whole PRD happy path — register, ingest a sample with live SSE progress, Brief, filters, table, chart builder, regenerate, a column type override, a malformed upload, delete — against the services in Docker, with the app served by Playwright and reaching them through Next rewrites. That is the production request path too (§8: Vercel rewrites to Railway), so it exercises the rewrite, the `proxy.ts` redirect and real JWT/JWKS verification, none of which the mock suite can.

`docker-compose.ci.yml` overlays the dev stack for that run: the three backend services switch to their **production** image targets with no bind mounts, `ENV`/`NODE_ENV=production`, RS256 keys supplied by the run, and non-default S3 credentials — so the images that would ship are the ones under test, with the data service's production config guard active.

GitHub Actions (`.github/workflows/ci.yml`) runs four jobs on every push and pull request: `checks` (lint, format, typecheck, build, unit tests), `contract`, `e2e-mock` and `e2e-real`.

## 8. Deployment (post-MVP)

- **Vercel:** `apps/web`.
- **Railway:** `auth-node`, `data-py`, `data-worker`, Postgres, and Redis. Object storage on Cloudflare R2.
- Nginx is dropped in production. Vercel rewrites `/api/auth/*` and `/api/data/*` to the Railway services, which keeps a same-site origin for cookies. Nginx remains the local gateway and the architecture reference.
