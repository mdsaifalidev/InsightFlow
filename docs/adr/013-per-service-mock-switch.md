# ADR-013: Incremental backend integration via a per-service mock switch

**Status:** Accepted · 2026-09-22

## Context
The UI was built entirely on MSW (ADR-009). Backend services arrive one at a time (auth in Phase 3, data in Phase 4). Waiting for every service before wiring any of them would push all integration risk to the end. Switching everything at once would leave the app unusable between phases.

## Decision
- Each backend area gets its own switch. Phase 3 adds `NEXT_PUBLIC_AUTH_MODE=service|mock`, and Phase 4 will add the equivalent for data.
- In `service` mode, MSW does not register the auth handlers, so `/api/auth/*` goes to the network. That means the nginx gateway in Docker, or a Next rewrite to `AUTH_SERVICE_URL` for native `pnpm dev`. Data endpoints stay on MSW.
- The mock data layer accepts real access tokens by **decoding** their `sub`/`wid`/`exp` claims without verifying the signature. Signature verification belongs to the real data service, which verifies against the JWKS (ADR-007). The mock only needs the workspace to scope its data.
- Default is `mock`, so Vitest and Playwright stay backend-free. `apps/web/.env.development` and Docker Compose set `service`.

## Consequences
- Each phase is integrated and verified in the browser as soon as it lands, and the rest of the app keeps working on mocks.
- The contract (PRD §9) has to hold exactly: the same web code talks to MSW and to the real service.
- The mock data store is per-browser (localStorage) while accounts are real. Resetting mock data no longer removes accounts.

## Update (Phase 4, 2026-09-22)
- `NEXT_PUBLIC_DATA_MODE=service|mock` switches the data area. `lib/backend-mode.ts` holds both switches; MSW doesn't start at all when every area is in service mode. Demo controls (latency, failing uploads) only show while data is mocked.
- Native dev rewrites `/api/data` to `DATA_SERVICE_URL`. Two Next dev-server details: with `proxy.ts` present Next buffers request bodies (raised to 110 MB via `experimental.proxyClientMaxBodySize`), and it gzips responses unless they say `Cache-Control: no-transform`, which the data service sets on SSE so events aren't held back.
