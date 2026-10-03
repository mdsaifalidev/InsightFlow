# ADR-009: MSW for UI-first development

**Status:** Accepted · 2026-09-21

## Context
The entire UI is built before the backend exists, and switching to the real services must not require rewriting components.

## Decision
Use **Mock Service Worker** to intercept the real API paths from PRD §9 in the browser (and in Node for tests). Toggle it with `NEXT_PUBLIC_API_MOCKING`. Mock fixtures are typed against the API contract, and SSE is simulated with a `ReadableStream`.

## Consequences
- Components, hooks, and the API client are production code from day one. The backend switch is an env flag, and it can be done per handler.
- The same handlers serve Vitest and Playwright tests.
- Mocks can drift from the real API. This is mitigated by typing fixtures with the generated `api-types` once the services exist.
