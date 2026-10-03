# InsightFlow — Product Requirements Document (MVP)

| | |
|---|---|
| **Status** | Draft v0.1 — for review |
| **Owner** | Saif |
| **Last updated** | 2026-09-22 |
| **Related** | [ARCHITECTURE.md](./ARCHITECTURE.md) · [ADRs](./adr/) · [Original idea](../InsightFlow_Project_Details.md) |

---

## 1. Summary

InsightFlow turns raw business data files (CSV/XLSX) into an interactive dashboard and a grounded AI executive summary within seconds of upload. It is built as a **portfolio showcase** of polyglot microservice design: Next.js for the UI, Node.js (Fastify) for auth and I/O, Python (FastAPI + Polars) for heavy data processing and AI, PostgreSQL for state, and Redis for job queues and progress events.

## 2. Problem

1. **Non-technical stakeholders can't read raw data.** Exports from Shopify, Stripe, CRMs, and logs arrive as large spreadsheets. Getting insight out of them takes an analyst and hours in Excel or a BI tool.
2. **BI tools are heavy to set up.** Metabase, Looker, and Power BI need connectors, modeling, and manual chart building before they show anything.
3. **Single-runtime web apps choke on analytics.** Parsing a 100MB file on a Node event loop blocks every other request. InsightFlow routes each workload to the runtime best suited for it.

## 3. Goals & Non-Goals

### Goals (MVP)
- **G1:** Upload a file and see an auto-generated dashboard with no configuration.
- **G2:** An AI summary explains *what changed and why it matters*, and every number in it comes from real computation, never from the LLM.
- **G3:** The UI stays responsive during heavy processing. All parsing is async, and progress streams live.
- **G4:** The system design is clear, demonstrable, and benchmarked. Every resume metric is backed by a reproducible benchmark.

### Non-Goals (MVP)
- Live database connectors (Postgres, BigQuery, etc.). Files only.
- Team collaboration, sharing, RBAC.
- Webhook/event ingestion (planned for v1.1).
- Conversational "ask your data" chat (v1.1).
- Billing, SSO, OAuth.

## 4. Personas

| Persona | Description | Needs |
|---|---|---|
| **Maya — Business stakeholder** | Ops/marketing manager with weekly CSV exports. Not technical. | "Tell me what happened this month and whether I should worry." |
| **Arif — Data-savvy analyst** | Comfortable with spreadsheets and SQL. Wants speed. | Fast profiling, filters, custom charts, raw row inspection. |
| **Reviewer — Hiring manager / interviewer** | Evaluates the project. | A clean demo, a clear architecture, credible metrics, readable code. |

## 5. User Journey (happy path)

1. Maya signs up. A personal workspace is created automatically.
2. She drags `orders_2025.csv` (60MB) into the upload dialog.
3. A progress stream shows each stage: `Uploading → Queued → Parsing → Profiling → Building dashboard → Generating AI summary → Ready`.
4. The dashboard opens with KPI cards (Total revenue, Orders, AOV), a revenue-over-time line chart, top categories as a bar chart, and distributions.
5. The AI summary panel reads, for example: *"Revenue fell 18% in March, driven by the Electronics category (−42%). Order count was stable, so the drop comes from lower basket value…"*, with anomaly callouts highlighted on the charts.
6. Arif filters to `region = EU` and the last 90 days. All widgets update.
7. Arif opens the Table tab, sorts by `amount desc`, and inspects outliers.
8. Arif builds a custom "Avg discount by channel" bar chart and saves it to the dashboard.

## 6. Functional Requirements

Priorities: **P0** = MVP-blocking, **P1** = MVP-desired, may slip to v1.1.

### F1 — Authentication & Personal Workspace (P0)
**User stories**
- As a visitor, I can sign up with name, email, and password.
- As a user, I can log in and out, and my session survives a page refresh.
- As a user, all my datasets are private to my personal workspace.

**Acceptance criteria**
- [x] Passwords are hashed with Argon2id. Minimum 8 characters, validated client- and server-side (zod / Fastify schema).
- [x] Login returns a short-lived **access token (RS256 JWT, 15 min)** in the response body and sets a **refresh token (7 days, rotating, httpOnly, Secure, SameSite=Lax cookie)**.
- [x] Refresh-token reuse detection revokes the whole token family.
- [x] A personal workspace is created in the same transaction as the user.
- [x] The Python service validates JWTs using the Node service's JWKS public key and never calls Node per request.
- [x] Login, logout, and refresh-reuse events are written to `auth.audit_logs`.
- [x] Login is rate-limited: 5 attempts per minute per IP+email (Nginx + Fastify).
- [x] Unauthenticated access to `/app/*` redirects to `/login`.

### F2 — Dataset Upload & Async Processing (P0)
**User stories**
- As a user, I can upload a CSV or XLSX file up to 100MB by drag-and-drop or file picker.
- As a user, I see live progress and can keep using the app while processing runs.
- As a user, I see a clear error if the file is invalid.

**Acceptance criteria**
- [x] Accepted types: `.csv`, `.xlsx`. Max 100MB (enforced in the UI, Nginx `client_max_body_size`, and FastAPI).
- [x] The upload is streamed to object storage (RustFS locally, S3/R2 in prod). The API returns `202 Accepted` with `datasetId` and `jobId` in under 1s after the upload completes.
- [x] The ARQ worker runs: parse (Polars) → normalize column names → infer types → write Parquet → profile → auto-dashboard spec → AI brief (inside the ingest job; a failed brief never fails the dataset). Rollups are deferred: filtered queries meet the p95 target without them (ADR-011, `infra/benchmarks/RESULTS.md`).
- [x] Each stage publishes progress to Redis pub/sub and is streamed to the client via **SSE**, with stage, percent, and message.
- [x] Failures set `status=failed` with a user-readable `error_message`, for example "Row 1,204 has 14 columns, expected 12".
- [x] Jobs retry transient failures up to 3 times with backoff. Jobs are idempotent per `jobId`.
- [x] Dataset states: `uploading | queued | processing | ready | failed` (`uploading` is shown client-side while the browser sends the file).

### F3 — Dataset Library (P0)
- [x] Lists datasets with name, row count, column count, size, status badge, and created date. Sortable, with search by name.
- [x] Datasets still processing show inline progress.
- [x] Delete removes metadata, Parquet, raw file, widgets, and insights, after a confirm dialog.
- [x] Empty state with an upload CTA and a "Try sample dataset" button (a bundled demo CSV).

### F4 — Column Profiling (P0)
- [x] For each column: inferred type (`numeric | categorical | datetime | boolean | text | id`), null %, distinct count, and min/max/mean/median/p95 for numerics, top-10 values for categoricals, and min/max date and inferred grain for datetimes.
- [x] Users can override an inferred type. The override triggers re-profiling of that column.

### F5 — Auto-Generated Dashboard (P0)
- [x] KPI cards (up to 4): totals/averages of key numeric measures with a period-over-period delta when a datetime column exists.
- [x] Chart selection heuristics:
  - datetime × numeric → **line/area** (auto time grain: day/week/month)
  - categorical (≤ 20 distinct) × numeric → **bar** (top N + "Other")
  - numeric alone → **histogram**
  - categorical share (≤ 6 distinct) → **donut**
- [x] At most 8 auto widgets. Bar charts are ordered by an interestingness score — the leading category's share of the top values (best around 60%: one clear winner with a real mix behind it), how readable the bar count is, and how complete the column is. *The group order (time series → bars → donut → histogram) and the cap of 8 are unchanged, and the cap does not bind today (7 widgets at most). Trend strength is not scored: the dashboard engine sees only column profiles, never rows. Score-driven **selection** of which categories get charted is a later step.*
- [x] Charts use shadcn Charts (Recharts), render correctly in light and dark mode, and are responsive down to 375px width.

### F6 — Multi-Variable Filters (P0)
- [x] A global filter bar with a date range (presets 7d/30d/90d/YTD/All plus custom) and up to 5 categorical multi-select filters.
- [x] Filters apply **server-side** to every widget and KPI in one round trip (a batched query endpoint).
- [x] Filter state lives in the URL query string, so it survives refresh and can be shared.
- [x] p95 filtered-dashboard response under 500ms for a 1M-row dataset (see NFR).

### F7 — Data Table Explorer (P0)
- [x] Server-side paginated (25/50/100/250 rows, per §9), sortable, and filtered by the global filters. Built on TanStack Table.
- [x] Column headers show a type icon and a mini profile popover.
- [x] Sticky header, column resize, and horizontal scroll that stays within the table.

### F8 — AI Executive Summary & Anomaly Highlights (P0)
- [x] Python computes the facts first: period-over-period changes, top contributors to change, and robust z-score anomalies (median/MAD, |z| ≥ 3.5) on time series. *Trend breaks are not detected yet.*
- [x] The LLM receives **only the computed facts as structured JSON** and returns a summary (≤ 150 words), 3–5 key findings, and suggested next questions. The prompt forbids stating numbers that are not in the facts.
- [x] A post-validation check extracts numbers from the LLM output and verifies they appear in the facts. If any fail, the summary is regenerated or those sentences are dropped.
- [x] Anomalies are shown as callouts in the summary panel and as markers on the matching chart.
- [x] The provider is pluggable (`LLM_PROVIDER=gemini|mock`). `mock` returns deterministic output for dev, tests and CI; `gemini` (`gemini-2.5-flash`) is the real narrator. *Claude and OpenAI adapters remain one file each ([ADR-010](./adr/010-provider-agnostic-llm.md) addendum).*
- [x] A "Regenerate" button (rate-limited to 5 per dataset per hour). The model and token usage are stored per insight.

### F9 — Custom Chart Builder (P1)
- [x] A dialog to choose chart type (line/bar/area/donut/histogram), X dimension, Y measure, aggregation (sum/avg/count/min/max/count distinct), optional series split, and title.
- [x] Live preview, then save as a widget on the dataset dashboard. Widgets can be edited and deleted.
- [x] Dashboard layout order persists (drag reorder is P2).

### F10 — App Shell & Settings (P0)
- [x] shadcn sidebar layout with navigation (Datasets, Settings), a user menu, and a light/dark/system theme toggle.
- [x] Settings: profile name, change password, delete account (cascades the workspace data).
- [x] Toast notifications (sonner) for job completion and errors.

## 7. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | 100MB CSV (~1M rows × 12 cols) goes from upload complete to `ready` in **< 30s** on a dev laptop, excluding the LLM step. Filtered dashboard query p95 **< 500ms** at 1M rows. Initial dashboard page LCP **< 2.0s**. |
| **Responsiveness** | Auth API p95 < 100ms under 200 RPS (k6). The Node event loop is never blocked by data work. |
| **Reliability** | Jobs survive a worker restart (ARQ persistence plus retries). No partial datasets are shown as `ready`. |
| **Security** | JWT RS256 with a JWKS endpoint. httpOnly refresh cookie. CORS locked to the web origin. Every data query is scoped by `workspace_id` from the token. Parameterized SQL only. Upload MIME and extension are validated. Secrets come from env only. OWASP ASVS L1 as the target. |
| **Accessibility** | WCAG 2.1 AA: keyboard-navigable, visible focus, and chart data also available in a table view. |
| **Responsive UI** | Usable from 375px to 1920px+. |
| **Observability** | Structured JSON logs (pino / structlog) with a request ID propagated through Nginx → services → jobs. `/health` and `/ready` endpoints on each service. |
| **Type safety** | Frontend types generated from the service OpenAPI specs. CI fails on drift. |
| **Dev experience** | `docker compose up` starts the whole stack with hot reload. Seed script plus sample datasets. |

## 8. Data Model (draft)

**Schema `auth` (owned by Node / Drizzle)**
- `users` (id uuid pk, email citext unique, name, password_hash, created_at, updated_at)
- `workspaces` (id uuid pk, owner_id fk users, name, created_at)
- `refresh_tokens` (id, user_id, family_id, token_hash, expires_at, revoked_at, replaced_by) — idx(user_id), idx(family_id)
- `audit_logs` (id bigserial, user_id, action, ip, user_agent, metadata jsonb, created_at) — idx(user_id, created_at desc)

**Schema `analytics` (owned by Python / Alembic)**
- `datasets` (id uuid, workspace_id, name, original_filename, file_type, size_bytes, row_count, column_count, status, error_message, raw_object_key, parquet_object_key, created_at, ready_at) — idx(workspace_id, created_at desc)
- `dataset_columns` (id, dataset_id, name, original_name, position, inferred_type, override_type, profile jsonb)
- `jobs` (id uuid, dataset_id, kind [ingest|insight], status, stage, progress, attempts, error, started_at, finished_at)
- `metric_rollups` (dataset_id, measure, time_grain, bucket_start, dimension, dimension_value, sum, count, min, max) — composite idx(dataset_id, measure, time_grain, bucket_start) plus a partial idx for `dimension IS NULL`
- `widgets` (id, dataset_id, kind [auto|custom], chart_type, spec jsonb, position, created_at)
- `insights` (id, dataset_id, facts jsonb, summary, findings jsonb, anomalies jsonb, provider, model, input_tokens, output_tokens, created_at)

> Cross-schema rule: services never write to another service's schema. Python only needs `workspace_id`, which it reads from the JWT, so no cross-schema foreign keys exist. See [ADR-006](./adr/006-schema-per-service.md).

## 9. API Contract (outline)

All routes go through the Nginx gateway. Errors use RFC 7807 `application/problem+json`.

**Auth service — `/api/auth` (Node/Fastify)**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create user + workspace → `{ user, accessToken }` + refresh cookie |
| POST | `/api/auth/login` | → `{ user, accessToken }` + refresh cookie |
| POST | `/api/auth/refresh` | Rotate refresh cookie → `{ accessToken }` |
| POST | `/api/auth/logout` | Revoke refresh family, clear cookie |
| GET | `/api/auth/me` | Current user + workspace |
| PATCH | `/api/auth/me` | Update name / password |
| DELETE | `/api/auth/me` | Delete account |
| GET | `/api/auth/.well-known/jwks.json` | Public keys for JWT verification |

**Data service — `/api/data` (Python/FastAPI)**

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/data/datasets` | Multipart upload → `202 { dataset, jobId }` |
| POST | `/api/data/datasets/sample` | Create from bundled sample dataset |
| GET | `/api/data/datasets` | List (search, sort, cursor pagination) |
| GET | `/api/data/datasets/{id}` | Dataset detail + columns + profile |
| DELETE | `/api/data/datasets/{id}` | Delete dataset and artifacts |
| PATCH | `/api/data/datasets/{id}/columns/{colId}` | Override inferred type |
| GET | `/api/data/jobs/{jobId}/events` | **SSE** progress stream |
| GET | `/api/data/datasets/{id}/dashboard` | KPIs + widget specs |
| POST | `/api/data/datasets/{id}/query` | Batched widget queries + KPIs with filters → series data (each result carries its display `format`) |
| GET | `/api/data/datasets/{id}/rows` | Rows: `page`, `pageSize` (25/50/100/250), `sort=column:asc\|desc`, `filters` (JSON-encoded filter shape) |
| GET | `/api/data/datasets/{id}/filters/{column}/values` | Distinct values for filter dropdowns |
| GET/POST | `/api/data/datasets/{id}/widgets` | List / create custom widget |
| PATCH/DELETE | `/api/data/datasets/{id}/widgets/{wid}` | Update / delete widget |
| GET | `/api/data/datasets/{id}/insights/latest` | Latest AI summary + anomalies |
| POST | `/api/data/datasets/{id}/insights` | Regenerate (enqueues job) |

**Shared filter shape**
```json
{
  "dateRange": { "column": "order_date", "from": "2025-01-01", "to": "2025-03-31" },
  "where": [{ "column": "region", "op": "in", "values": ["EU", "UK"] }]
}
```

**Value formats** (KPIs, widget results, facts): `number`, `currency`, `duration_ms`, `percent` (value already in percentage points), `change` (signed fraction, e.g. `-0.184`). KPIs include `deltaLabel`, such as "vs previous 90 days", so the UI always says what a delta compares.

**Mock-only endpoints** (Phase 2 MSW backend, not part of the service contract): `GET/PATCH /api/mock/settings` and `POST /api/mock/reset`, used by Settings → Demo controls.

**SSE event shape**
```
event: progress
data: {"jobId":"…","stage":"profiling","progress":62,"message":"Profiling 12 columns"}

event: done
data: {"jobId":"…","datasetId":"…","status":"ready"}
```

## 10. UI Screens (Phase 2 build order, all on MSW mocks)

1. **App shell**: sidebar, header with breadcrumb, theme toggle, user menu.
2. **Auth**: `/login`, `/register`.
3. **Datasets**: `/app/datasets`, with list, empty state, upload dialog, and live progress.
4. **Dataset dashboard**: `/app/datasets/[id]`, with filter bar, KPI row, auto chart grid, and AI summary panel.
5. **Table explorer**: `/app/datasets/[id]/table`.
6. **Columns/profile**: `/app/datasets/[id]/columns`.
7. **Chart builder**: dialog from the dashboard (P1).
8. **Settings**: `/app/settings`.

## 11. Success Metrics (portfolio)

Each metric is produced by a script in `infra/benchmarks/` and recorded in `infra/benchmarks/RESULTS.md`:

| Claim | How it is measured |
|---|---|
| Dashboard LCP improvement from RSC/streaming | Lighthouse CI: client-only fetch vs RSC + Suspense streaming |
| API timeout/error reduction from async processing | k6: synchronous parse-in-request baseline vs 202 + ARQ queue, under concurrent uploads |
| Aggregate query speedup from indexing and rollups | `EXPLAIN ANALYZE`: raw Parquet/unindexed scan vs `metric_rollups` + composite index over multi-month ranges |
| Polars vs Pandas ingest speed | pytest-benchmark on 10k / 100k / 1M-row CSVs |

## 12. Release Plan

| Phase | Deliverable |
|---|---|
| 0 | PRD, architecture, ADRs, CLAUDE.md *(this document)* |
| 1 | Monorepo + Docker Compose (Postgres, Redis, RustFS, Nginx, web) |
| 2 | Complete UI on MSW mocks |
| 3 | Node auth service |
| 4 | Python data service + worker + AI |
| 5 | Typed API contracts, CI, Playwright E2E (mocks + real stack), real LLM provider |
| 6 | Public face: landing page and captured product screenshots (the no-signup demo it also shipped was removed; ADR-015) |
| 7 | Deploy (Vercel + Railway), v1.1 planning |

**v1.1 backlog:** webhook ingestion engine (Node + BullMQ, idempotency keys, live event feed), team workspaces and invites, "Ask your data" chat (NL → validated query), Google/GitHub OAuth, drag-reorder dashboard, CSV export, scheduled re-imports.

## 13. Risks & Open Questions

| Risk / Question | Mitigation / Status |
|---|---|
| Custom chart builder may blow the MVP timeline | It is last in build order and marked P1; it slips to v1.1 if needed |
| LLM hallucinating numbers | Facts-only prompting plus numeric post-validation (F8) |
| XLSX parsing memory on 100MB files | Use `fastexcel`/calamine via Polars; cap sheets to the first sheet in MVP |
| MinIO community images discontinued (Oct 2025) | Resolved: RustFS locally ([ADR-012](./adr/012-rustfs-object-storage.md)) |
| Railway ephemeral disk for Parquet | Object storage (R2/S3) in prod, never local disk |
| Vercel ↔ Railway cross-origin cookies | Serve the API under a subdomain of the same site (`api.<domain>`), SameSite=Lax |
| **Open:** product domain name and branding | TBD |
| **Open:** sample datasets to bundle (e-commerce orders, SaaS MRR, web logs?) | Decide in Phase 2 |
