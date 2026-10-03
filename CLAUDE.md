# InsightFlow — Claude Code Guide

AI analytics platform: upload CSV/XLSX → auto dashboard + grounded AI summary. Portfolio showcase of polyglot microservices.

**Read first:** `docs/PRD.md` (scope, API contract §9, acceptance criteria) · `docs/ARCHITECTURE.md` · `docs/adr/` (why each tech choice).

Also read `AGENTS.md`: Next.js 16 differs from older versions. Check the bundled docs in `apps/web/node_modules/next/dist/docs/` before using Next APIs.

## Current phase
Phases 0–4 are merged. **Phase 5 is in progress** on `feat/phase-5-integration`, in three checkpoints: A (done): typed contracts — service OpenAPI specs, `packages/api-types`, drift check; B (done): GitHub Actions CI and a real-stack Playwright suite against the production images; C (done): Gemini narrator, bar-chart ranking, measured-metrics write-up. Phase 6 (done) is the public face: a landing page at `/` and captured product screenshots. Its no-signup demo accounts (ADR-014) were removed again — every user signs up (ADR-015). Phase 6c (done) gave the landing page a token layer, the marketing `Band` and the file-to-dashboard hero. **Phase 6d (on `feat/phase-6d-redesign`) redesigns the whole app as an analyst's instrument: graphite chrome, a Prussian accent, compact density, sentence-case labels.** Deployment is Phase 7.

## Stack
- `apps/web`: Next.js 16 (App Router, no `src/` dir) + TypeScript + Tailwind v4 + **shadcn/ui** (charts = Recharts, tables = TanStack Table), TanStack Query, nuqs (URL state), react-hook-form + zod, next-themes, **MSW** mocks.
- `services/auth-node`: **Fastify** + TypeScript + **Drizzle** (Postgres schema `auth` only), jose (RS256 JWT + JWKS), argon2.
- `services/data-py`: **FastAPI** + **Polars** + SQLAlchemy/Alembic (schema `analytics` only) + **ARQ** worker, managed with **uv**.
- `packages/ui`: shared shadcn/ui components (Radix base, `radix-nova` style, lucide icons) and the Tailwind v4 theme in `src/styles/globals.css`. Import as `@workspace/ui/components/<name>`.
- Infra: PostgreSQL 17, Redis 7, RustFS (S3, ADR-012), Nginx gateway, all in `docker-compose.yml`.
- Monorepo: pnpm workspaces + Turborepo.

## Rules
- **API contract is the source of truth:** MSW handlers, fixtures, and real services must match PRD §9. Update the PRD first when the contract changes.
- **Service boundaries:** a service never writes to another service's Postgres schema. No sync service-to-service HTTP calls. Python verifies JWTs via JWKS.
- **Every data query is scoped by `workspace_id` from the token.**
- **LLM never produces numbers:** facts come from Polars, the LLM only narrates, and output is validated (ADR-010). `mock` is the default everywhere; `gemini` is the real narrator. A key belongs in the untracked `services/data-py/.env.local`, never in the committed `.env.development`.
- **Resume metrics must be measured** with scripts in `infra/benchmarks/`. Never invent numbers.
- New significant tech decisions get an ADR in `docs/adr/`.
- UI: use shadcn components before building custom ones. It must work in light and dark mode and at 375px width. Keep filter state in the URL.
- Before using a library API, check the current docs (context7). Versions move fast.

## Commands
```bash
pnpm install                 # pnpm 12: enforces minimumReleaseAge (24h) and build-script allowlist (pnpm-workspace.yaml)
pnpm dev                     # web natively (Turbopack) on :3000 — pair with `pnpm infra:up`
pnpm infra:up / infra:down   # postgres, redis, rustfs (+ bucket init) only
pnpm stack:up / stack:down   # full Docker stack; gateway on http://localhost:8080
pnpm stack:logs
pnpm lint | typecheck | build | format   # via Turborepo
pnpm --filter web test       # Vitest + Testing Library; MSW runs in Node (mocks/server.ts)
pnpm --filter @insightflow/auth-node test         # Vitest + Testcontainers (needs Docker; starts Postgres 17)
pnpm --filter @insightflow/auth-node db:generate  # drizzle-kit: SQL migration from src/db/schema.ts
pnpm --filter @insightflow/auth-node db:migrate   # apply migrations (needs DATABASE_URL)
pnpm --filter @insightflow/auth-node keys:generate # print a PEM key pair for prod env
pnpm --filter @insightflow/data-py test       # pytest + Testcontainers (Postgres 17, Redis 7) + moto S3; needs Docker
pnpm --filter @insightflow/data-py dev        # native: migrations + API (:8000) + worker; defaults in services/data-py/.env.development
cd services/data-py && uv run alembic revision --autogenerate -m "..."   # new migration (point DATABASE_URL at a scratch DB)
pnpm --filter web fixtures:export  # re-export sample CSVs + golden engine outputs into services/data-py
pnpm api-types                     # dump both OpenAPI specs and regenerate packages/api-types (no DB needed)
uv run --project services/data-py python infra/benchmarks/gen_large.py      # 1M-row CSV (then ingest_bench.py / query_bench.py; stack must be up)
pnpm --filter web test:e2e   # Playwright smoke (builds + starts the app on :3100 with MSW)
                             # one-time: cd apps/web && pnpm exec playwright install chromium
pnpm e2e:real                # full walkthrough vs the real services: boots them in Docker, runs, tears down
pnpm e2e:real --ci           # same, but on the production images (docker-compose.ci.yml); needs JWT_PRIVATE_KEY/JWT_PUBLIC_KEY
node scripts/e2e-stack.mjs up|down [--ci]   # just the services, to iterate on the suite
pnpm format:check            # what CI runs; `pnpm format` writes
pnpm --filter web shots      # re-capture the landing page's product screenshots (own build + browser)

# Real narrator (costs money; mock is the default):
#   services/data-py/.env.local  ->  LLM_PROVIDER=gemini + GEMINI_API_KEY=...   (gitignored)
#   root .env for Docker         ->  the same two variables

# Add shadcn components (run from apps/web; files land in packages/ui):
cd apps/web && pnpm dlx shadcn@latest add <component>
# Then make sure the component's npm deps ended up in packages/ui/package.json, not apps/web.
```

## Gotchas
- Run a scratch `next dev` on the default `.next` dir (or a gitignored `.next-real`/`.next-shots`): Tailwind's `@source` scans `apps/**`, and a non-ignored dist dir gets its compiled output parsed as class candidates ("Parsing CSS source code failed").
- MSW handlers live in `apps/web/mocks/handlers/`; `MSWProvider` blocks render until the worker starts. The mock DB (`mocks/db/store.ts`) persists to localStorage; auth sessions are simulated there because MSW can't set httpOnly cookies.
- **Backend modes** (`lib/backend-mode.ts`): `NEXT_PUBLIC_AUTH_MODE` / `NEXT_PUBLIC_DATA_MODE` = `service` (dev/Docker) send `/api/auth` / `/api/data` to the real services; `mock` (default, used by Vitest/Playwright) keeps MSW. MSW doesn't start when both are `service`; demo controls only show while data is mocked. In service mode `proxy.ts` (Next 16's renamed middleware) redirects `/app/*` without the `if_session` cookie; `AuthGate` still restores the in-memory token. MSW data handlers decode (not verify) real JWTs for `wid`.
- Native dev: `pnpm infra:up` then `pnpm dev` runs web + auth-node; don't run the Docker `auth-node` at the same time (port 4000). Next rewrites `/api/auth` to `AUTH_SERVICE_URL`.
- Service roles need `CREATE ON DATABASE` (granted in `infra/postgres/init/01-schemas.sh`) because `CREATE SCHEMA IF NOT EXISTS` checks it first. Existing volumes created before Phase 3 need the grant applied by hand.
- Docker installs are filtered per app (`pnpm install --filter <pkg>...`) with per-package `node_modules` volumes, so containers never write Linux binaries into host package folders.
- Auth rate limiting uses Redis when `REDIS_URL` is set and runs in the `preHandler` hook (after body parsing), so it is keyed by IP + email.
- `SidebarMenuButton` forces direct `svg` children to `size-4`; wrap larger marks in a div.
- In Docker the web container runs `dev:docker` (`next dev --webpack` + polling): Turbopack can't poll bind mounts on Windows.
- `apps/web/Dockerfile` sets `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=5000`; without it npm/pnpm time out inside containers on this network.
- Postgres volume is `pgdata17` (named per major version). A stale `insightflow_pgdata` (PG16) volume from an earlier experiment may exist; it is unused.
- Host ports are overridable in `.env` (XAMPP Apache may own :80, hence gateway :8080).
- MSW handler paths start with `*/api/...` so they match any origin (browser, `NEXT_PUBLIC_API_BASE_URL`, and Node tests, which have no `location`).
- The mock engine (`mocks/db/engine/`) mirrors the future Python pipeline: parse → infer types → profile. Sample datasets (`mocks/db/samples/`) are seeded and contain **planted anomalies** the Brief should find (April Electronics dip, June Starter churn, Sep 18 checkout latency); `samples.test.ts` guards them.
- Mock ingest jobs are timed by `settings.latencyMs` (0 in tests). Set `settings.failNextUpload` in the `insightflow.mock.v1` localStorage entry (then reload) to exercise failure states until Settings has mock controls.
- **Tests & jsdom:** `jsdom` is pinned to 27.4.0 because Vitest 5.0's jsdom environment reads Blob internals that jsdom ≥ 28 renamed. Even so, MSW can't parse multipart bodies from jsdom's File/FormData: tests that upload run with `// @vitest-environment node` and fetch, or stub `lib/upload` (see `upload-dialog.test.tsx`). The XHR progress path is covered by Playwright.
- Job progress: `features/datasets/job-tracker.ts` keeps one SSE stream per job, shared by all components; `JobTrackerBridge` (in the app shell) owns the completion toast and cache invalidation.
- The Write tool turns a `\uFEFF` escape into a literal BOM, which the watermark hook flags. Keep the escape as text in source (see `mocks/db/engine/parse.ts`).
- **Recharts must be a single instance:** import it from `@workspace/ui/lib/recharts`, never add `recharts` to apps. Two copies (pnpm peer-hash split) break `ChartContainer`'s size context and charts render empty.
- Chart colors (`--chart-1..6`) were validated with the dataviz palette checker for light (`#ffffff`) and dark (`#1a1d24` card, `#16191f` panel) surfaces; re-run it if you change them or a chart surface. **Colour rule (Phase 6d): chrome is ink, data is colour, amber means computed.** Chrome is neutral graphite; the Prussian `--primary` (`#2741a6` / `#8ea2ff`) is spent only on interaction (primary action, active nav marker, focus ring, tab underline); series colours belong to charts (a hand-drawn chart uses `chart-1`, never `primary`); amber `--signal` marks only FactMarks and anomalies, so don't use it for warnings or data-quality bars.
- Wide content needs `min-w-0` on flex ancestors (`SidebarInset`, `Page`), or tables widen the page instead of scrolling.
- The mock analytics engine lives in `mocks/db/engine/` (query, KPIs, auto-dashboard, facts, narrative). Brief text may only cite numbers as `{{factId}}` tokens; `validateNarrative` enforces it (ADR-010). `facts.test.ts` guards the planted stories.
- Filter presets (`range=30d`…) resolve against the dataset's latest date, not today.
- **LLM layer:** `app/llm/` is **not** part of the TS/Python parity contract (only `app/engine/*` is). `prompt.py` holds the prompt; its list of allowed literals must stay in step with `ALLOWED_NUMBER_PATTERNS` in `app/engine/narrative.py`, or every brief burns three attempts and silently lands on the template. `TransientLLMError` (timeout, 408/429/5xx) retries; anything else fails once. Two caps: `GEMINI_TIMEOUT_S` per call, `MAX_TOTAL_SECONDS` for all attempts, because `GET /insights/latest` and the column-type override generate a brief inside the request.
- `tests/conftest.py` pins `LLM_PROVIDER=mock` at import: without it a developer's `.env.local` would make pytest call — and bill — a real API, and the golden brief comparisons would become random.
- **Chart ranking:** `barScore` / `bar_score` must stay identical in both engines (same terms, same order, `js_round(..., 6)`); each suite asserts the same exact values, and ties fall back to column position rather than relying on sort stability. It is a deliberate no-op on the three sample datasets — the fixture export must produce **zero diff** — so the synthetic tests in `dashboard.test.ts` / `test_engine_dashboard.py` are what actually cover it.
- **Data service (`services/data-py`):** uv-managed (Python 3.13, `.python-version`); turbo runs its `lint`/`typecheck`/`test` through `package.json` wrappers. Routes carry the full `/api/data/...` prefix (nginx forwards paths unchanged). Start it with `uvicorn app.main:create_app --factory`.
- Tests that wait on Redis pub/sub poll `PUBSUB NUMSUB` (`subscribed()` in `tests/test_datasets_api.py`) instead of sleeping; fixed sleeps were flaky under the parallel turbo run.
- **API contract:** the services' OpenAPI specs and the types generated from them are committed under `packages/api-types`. After changing any route or response model run `pnpm api-types`; CI fails if that produces a diff. `apps/web/lib/api/contract.ts` asserts the hand-written `lib/api/types.ts` against the generated shapes, so drift fails `pnpm typecheck` naming the field that moved.
- data-py routes declare `response_model=` with `response_model_exclude_unset=True`: handlers keep returning dicts, FastAPI validates them, and an omitted key (a fact's `ref`) stays omitted while an explicit null is kept. Numbers use `Num = int | float` so whole numbers don't become `12253.0` on the wire.
- auth-node schemas are registered in zod's global registry with ids (`z.globalRegistry.add`), which is what makes the spec emit named components instead of inlining every shape.
- Type-level contract checks apply `Loose<>` at the call site: inside a generic, a conditional type stays unresolved and every comparison silently "passes" as deferred. `-?` in a mapped type also strips `undefined`, so the helper makes both sides optional instead.
- **There is no demo account** (ADR-015, superseding ADR-014): every user registers. Migration `0002` drops `auth.users.is_demo`; don't reintroduce a credential-less sign-in path. "Demo controls" in Settings and the "demo datasets" wording refer to the **mock backend**, not to accounts.
- **Motion** (`motion` v13, `apps/web` only — one instance, same reason as Recharts). Server components import `* as motion from "motion/react-client"`; anything with a hook is `"use client"` + `motion/react`. `MotionConfig reducedMotion="user"` is mounted in `app/providers.tsx`.
- **Two rules that outrank any effect.** (1) *The hero never animates in JavaScript*: Motion inlines `initial` into the SSR HTML, so a JS hero ships `opacity:0` in `index.html`, defers LCP to hydration and blanks the page if the bundle fails. The hero uses `tw-animate-css` keyframes in `globals.css`, inside `@media (prefers-reduced-motion: no-preference)`, and the `h1`/hero image move with **translateY only** so they stay LCP candidates. (2) *Never branch the returned JSX on `useReducedMotion()`* — it is `null` on the server and a boolean on the client, so a structural branch makes React 19 discard the whole server render (killing the priority hero image and remounting `ResponsiveContainer`). Express reduced motion as **values**: every animation takes its transition from `useTiming()` in `features/marketing/motion.ts`.
- **`reducedMotion` does not stop opacity animations.** Motion only skips transform and layout for reduced-motion users — opacity still runs at full duration, deliberately, so content still appears. That is why `useTiming()` returns `duration: 0`, and why in-app entrances use `motion-safe:animate-in` CSS instead: both collapse to nothing under `reducedMotion: "reduce"`, which all three Playwright configs now set.
- **Animation and Playwright**: actionability waits for an element's rect to be identical across two frames, so an infinite transform on or above a button hangs the click until the test times out. Ambient loops are `pointer-events-none` siblings; button hover changes shadow/background only; `whileInView` always sets `once: true`. A section containing something the reader points at (the Brief specimen's `FactMark`) uses `<Reveal fade>` so the target never moves between hit-test and click.
- **`shots/capture.spec.ts` waits for stillness**, not just for fonts: `stableLayout()` (three identical frames of page and table width) and `animationsFinished()` (every finite CSS/WAAPI animation done). Without those the captures differ run to run — the pagination button's `transition-all` alone was enough. `pnpm --filter web shots` twice must leave `git status` clean.
- **Design tokens** (`packages/ui/src/styles/globals.css`): a surface ladder (`--surface-ink|sunk|canvas|panel|raised|overlay`, 2–6 RGB points per step), four `--elev-*` levels exposed as `shadow-e1..e4`, `--border-soft|strong`, and a `--text-*` scale. The product uses `text-title` (page h1), `text-section` (card/section titles) and `text-label` (KPI and table-header labels); `display-*` stays marketing-only. **No uppercase labels**: `text-eyebrow` is sentence case now. Density is compact: `Table` cells are `h-9` at 13px with tabular figures, the app header is `h-12`, `--radius` is 0.5rem, and radius follows hierarchy (dialogs `xl`, cards `lg`, controls `md`, FactMarks 3px). Dataset status is a dot plus a word, not a pill. Settings uses `SettingsSection` (`features/settings/components/settings-section.tsx`), not stacked cards. Newsreader is the display face (already loaded as a variable font, so it costs nothing); the app keeps the sans steps, so the serif is opt-in per element. Surfaces are colour tokens, not Linear's tinted-overlay trick, because `ChartContainer`, `table-view.tsx` and the `Band` all need to read or re-point them as colours. `--border` itself stays opaque: the base layer applies it to every element.
- **Marketing `Band`** (`features/marketing/components/band.tsx`) declares surface, rhythm (64/112/176 plus two flush joins) and width. Tone is two mechanisms that only work together: a literal `dark` class gives correct token values in either theme (verified: `--signal`, the dark-validated chart palette, and `AppFrame`'s capture swap all resolve correctly), and `data-tone` gives contrast between adjacent bands, which `dark` cannot when the page is already dark. Never use a `dark:` variant **on** a Band element — that variant matches descendants. Charts must sit on `--card`, never on a band background (the palette was validated against `--surface-raised`). **Never put a Band inside `app/app/*`.**
- **The hero's file-to-dashboard device** animates with CSS scroll-driven animation, and the *finished* composition is the default — the keyframes only run backwards from it. That is what makes no-JS, no-`animation-timeline` support (Firefox, Safari) and reduced motion all yield the whole argument. It lives in the hero's second viewport, below the fold, which is what lets it animate without touching the LCP element. **`animation-timeline` must never be used inside `app/app/*`**: a scroll-timeline animation reports `playState: "running"` with *finite* iterations, so `animationsFinished()` in `shots/capture.spec.ts` would wait for it forever.
- The landing page renders the product's **real** `Brief` (`BriefBody`, exported from `features/insights/components/brief.tsx`) fed the committed `showcase-data.json` insight, inside a `HighlightProvider` shared with the chart above it — so hovering a grounded number highlights the point it was computed from. `showcase-raw.json` is separate because `live-showcase.tsx` is `"use client"` and would otherwise ship the raw CSV rows to every visitor. `BriefSpecimen` is now auth-only; it contains hand-written numbers and was captioned as coming from a real file.
- Re-captured screenshots do **not** appear until you clear `apps/web/.next/cache/images` *and* hard-reload: both Next's image optimizer and the browser key on `/_next/image?url=/screenshots/x.png`, which does not change when the file does. On a deploy that is a CDN invalidation problem, not just a local annoyance.
- **`LazyMotion` was tried and reverted, with numbers.** The advertised 4.6kb-vs-34kb only pays when Motion is not needed at first paint; here `Reveal` runs on every band, so the deferred chunk is fetched immediately anyway. Measured JS transferred for `/`: **1782.1 KB before, 1782.3 KB after**, across 25 files rather than 28. It also made `strict` a footgun for anyone later adding a `motion.*` component. Don't re-attempt it without re-measuring — and measure transferred bytes for the route, not the build's total chunk size, which cannot change when code merely moves between chunks.
- **The landing page** is a `(marketing)` route group at `/`; `/app/*` is the product. It is a server component and must stay one — reading the httpOnly `if_session` cookie would make the whole route dynamic (Suspense doesn't isolate that without `cacheComponents`), so the nav is deliberately not personalised. `SAMPLES` lives in `features/datasets/samples.ts`, not in the `"use client"` picker, because a server component importing from a client module gets a reference proxy, not the array.
- **MSW gating:** `MSWBootstrap` (in `app/providers.tsx`) starts the worker on any route; the blocking `MSWProvider` wraps only `app/app/layout.tsx` and `app/(auth)/layout.tsx`, the subtrees that actually fetch. Don't move the gate back to the root — it blanks the marketing pages until the worker boots.
- **Product screenshots** are captured, not made: `pnpm --filter web shots` (`playwright.shots.config.ts`, its own `shots/` dir and `.next-shots` build) writes `apps/web/public/screenshots/*-{light,dark}.png` from the seeded mock data. Re-run it after visual changes to the dashboard, Brief, table or chart builder. CI doesn't: encoders aren't byte-identical across platforms, so a diff gate would cry wolf.
- **Three Playwright configs:** `playwright.config.ts` (MSW, :3100), `playwright.real.config.ts` (real services, :3101) and `playwright.shots.config.ts` (screenshots, :3102). All three set `reducedMotion: "reduce"`; `e2e/motion.spec.ts` opts back in with `test.use()` so the animated path stays covered. Each bakes its own `NEXT_PUBLIC_*` into a build, so they need separate output dirs — `next.config.ts` reads `NEXT_DIST_DIR` (`.next-real` for the real run). Both configs set `testMatch`, or each would run the other's spec.
- The real-stack run keeps its containers in a **separate compose project** (`insightflow-ci`), so its `down -v` can't touch dev volumes. Its S3 credentials come from `CI_S3_*`, not `S3_*`: the local `.env` sets `S3_ACCESS_KEY=rustfsadmin`, which the data service's production guard rejects.
- Compose **appends** list fields from an override file, so `ports: []` or `volumes: []` keeps the dev entries. `docker-compose.ci.yml` uses `!reset []` (Compose 2.24+); without it the CI stack silently ran the production image with the repo bind-mounted over `/app`.
- Prettier run from inside a package ignores the root `.prettierignore`, so the `format`/`format:check` scripts pass `--ignore-path ../../.prettierignore`. `services/auth-node` is deliberately outside Prettier's scope (reformatting it is a 600-line diff); so are the generated files in `packages/api-types`.
- Testcontainers needs Docker's credential helper on PATH; in a fresh shell add `/c/Users/ADMIN/AppData/Local/Programs/DockerDesktop/resources/bin` or pytest fails pulling ryuk.
- **Engine parity:** the Python engine ports `apps/web/mocks/db/engine/*`. `tests/golden/*.json` are outputs of the TS engine on the exported sample CSVs; if you change either engine, re-export and keep both in step. `js_round` reproduces JS `Math.round` (halves up).
- Datetime columns are stored as `Date` (pure dates) or `Datetime(ms, UTC)`; output strings match the mock's JS ISO forms (`2025-04-01`, `2025-09-18T16:05:43.000Z`). Timestamps without an offset are read as UTC.
- Queries read the typed Parquet into an in-process LRU (`app/frames.py`, keyed by Parquet object key; a type override writes a new key, so the cache can't go stale). Engine calls run in `asyncio.to_thread`.
- Query engine parity details: groups use `group_by(maintain_order=True)` plus stable sorts to match JS Map/sort tie order; `count` includes null rows; other aggregations only see numbers (booleans as 1/0). String sorts use byte order where the mock uses `localeCompare`, so ties may order differently for mixed-case text.
- Short CSV rows are padded with nulls (Polars); only extra cells or broken quotes are parse errors, reported with the row number.
- FastAPI SSE (`fastapi.sse.EventSourceResponse`, 15s `: ping`): the generator body runs after the response starts, so do lookups that may 404 in a dependency.
- `arq --watch` restarts in-process and keeps stale modules; the dev worker runs under the `watchfiles` CLI instead.
- Uploads stream into S3 in 8 MB multipart chunks while the body arrives (`app/upload.py`); don't switch back to `UploadFile`, which spools the whole file first (202 went from ~1.5 s to ~20 ms after the last byte).
- SSE responses carry `Cache-Control: no-cache, no-transform`: without `no-transform` the Next dev rewrite gzips the stream and holds every event until the end. With `proxy.ts` present Next also buffers request bodies (`experimental.proxyClientMaxBodySize: "110mb"` in `next.config.ts`).
- Turbo's strict env mode strips `PROCESSOR_ARCHITECTURE` on Windows, and Polars' CPU check then fails at import ("unknown feature flag: 'sse3'"); `services/data-py/turbo.json` passes it (and Docker/Testcontainers vars) through.
- Benchmarks: measured numbers live in `infra/benchmarks/RESULTS.md`; re-run the scripts after engine changes instead of editing numbers. Rollups (ADR-011) are deferred because the query p95 target is met.
- In Docker `/tmp` and the `/cache` volume are different filesystems: write temp files next to their final path before renaming.
- arq 0.28 pins `redis<6`, so testcontainers' Redis extra (redis ≥ 7) can't be installed; tests start `redis:7-alpine` as a generic container. arq itself is in maintenance mode (known risk; ADR-005).
- Windows has no system tz database; the `tzdata` package provides it for Polars.
- TanStack Table is **v9** (`tableFeatures`, `useTable`, `helper.columns([...])`); its bundled docs are in `node_modules/@tanstack/table-core/skills/`.
