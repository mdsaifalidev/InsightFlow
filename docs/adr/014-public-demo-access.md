# ADR-014: Ephemeral demo accounts for public access

**Status:** Superseded by [ADR-015](./015-remove-public-demo.md) · 2026-09-24

## Context
The landing page (Phase 6) has to let a stranger see the product working. A
screenshot only goes so far: the thing worth showing is a file becoming a
dashboard and a written brief. But the product needs an account, a workspace
and an ingest job to show anything, and asking for a signup before the value
is visible loses most visitors.

Three options were on the table: a shared demo account reset nightly, a
read-only sandbox rendering fixture data, and an ephemeral account per visitor.

## Decision
**`POST /api/auth/demo` creates a throwaway user and workspace**, returns the
same session as `/register`, and the browser then starts the `orders` sample
through the ordinary authenticated endpoint. The visitor watches the real
pipeline run over SSE and lands on a real dashboard.

- **Ephemeral, not shared.** Two visitors on a shared account would see each
  other's uploads and could delete each other's datasets (`DELETE /datasets/{id}`
  is scoped by workspace, and they would share one). A per-visitor workspace
  also needs no reset job.
- **No service-to-service call.** auth-node never tells data-py to seed
  anything; the browser does it with a normal request, so the boundary rule
  (ADR-006) holds and no new seeding machinery exists.
- **The account carries a `demo` claim in the JWT.** data-py never reads the
  auth schema, so the token is the only way the fact can travel. It caps demo
  workspaces at 5 datasets and 10 MB per upload.
- **No password is ever set.** A sentinel hash is stored instead of running
  argon2 (19 MiB per call) on a public endpoint; `verifyPassword` returns
  false for an unparseable hash, so sign-in fails cleanly rather than 500ing.
  The address is `demo-<uuid>@demo.insightflow.invalid` — `.invalid` is
  reserved (RFC 2606), so it can never collide with a real account.
- **Cleanup reuses account deletion.** An hourly sweep in auth-node deletes
  demo users older than 24h, publishing `user.deleted` **before** the delete:
  a missing publish orphans that workspace's Parquet and raw objects forever,
  while a publish followed by a failed delete only leaves an empty account for
  the next pass. A Redis lease stops replicas sweeping together.

## Consequences
- Anyone can create accounts and ingest files, so the endpoint is limited
  three ways: nginx `limit_req` on the real peer address, a per-IP Fastify
  limit (3/hour, `DEMO_RATE_LIMIT_PER_HOUR`), and the per-workspace caps above.
- **This exposed an existing bug:** nginx appended to `X-Forwarded-For` while
  the services trust the leftmost entry, so any client could forge its own IP
  and walk past every per-IP limit, including login's. The gateway now
  overwrites the header with `$remote_addr`.
- With Redis down the limiter fails closed and the endpoint 500s. That is the
  right trade for a public account-creation route; the landing page catches it
  and points at sign-up instead.
- A demo visitor returning after the sweep sees a brief spinner and lands on
  sign-in: their cookie outlives the account. Accepted, not hidden.
- Deleting a demo user does not invalidate an access token already issued, so
  one can work for up to its 15-minute lifetime. Bounded and acceptable.
