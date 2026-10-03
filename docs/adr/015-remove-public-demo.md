# ADR-015: Remove the public demo — every user signs up

**Status:** Accepted · 2026-10-01 · Supersedes [ADR-014](./014-public-demo-access.md)

## Context
ADR-014 let a visitor press **Try it now — no signup** on the landing page and
get a throwaway account and workspace with the `orders` sample already
ingesting. The product owner has decided that every user must create an
account: there is to be no way into the product without one.

Removing the button alone would not do that. `POST /api/auth/demo` would still
mint a session for anyone who called it, so the decision has to reach every
layer the demo touched.

## Decision
**There is no credential-less sign-in path.** The only ways in are
`/register` and `/login`.

Removed, end to end:

- **auth-node:** the `/demo` route, the `demo` JWT claim (including its
  re-read on `/refresh`), `DEMO_RATE_LIMIT_PER_HOUR`, the `demo_created` audit
  action, the hourly `pruneDemoUsers` sweep and its Redis lease, and the
  `demo:prune` script.
- **Database:** migration `0002_drop_demo_accounts` drops `auth.users.is_demo`.
- **data-py:** the `is_demo` principal field, the 5-dataset quota and the 10 MB
  upload cap for demo workspaces, and with them the `403` those two routes
  could return. The OpenAPI specs and `packages/api-types` are regenerated.
- **nginx:** the `demo_limit` zone and the `/api/auth/demo` location.
- **web:** the `DemoButton`, `useDemo`, `useCreateDemo`, the MSW handler, and
  the `?job=&ds=` handoff on the datasets page that existed only so a demo
  visitor arrived mid-ingest. Both landing CTAs are now **Create an account**
  and **Sign in**.

Kept: "Demo controls" in Settings and the bundled sample datasets. Those belong
to the mock backend and the empty state, not to accounts — a signed-up user
still starts from a sample in one click.

## Existing demo accounts
No environment was deployed while the demo existed, so the only place demo
rows can exist is a local development database. The migration handles them
conservatively:

- It **revokes their refresh tokens** before dropping the column, while the
  column still identifies them. A demo account could never sign in (it stores
  a sentinel password hash), but its refresh cookie would otherwise have kept a
  session alive after the endpoint was gone.
- It **does not delete the accounts.** A SQL delete cannot publish
  `user.deleted`, so the data service would never purge their Parquet and raw
  objects (ADR-006). Left in place they are inert: no session, no password,
  data still scoped to a workspace nobody can reach. Delete them through the
  normal account-deletion path if a clean database matters.

## Consequences
- A visitor sees the product working only through the landing page's live
  components and captured screenshots until they register.
- The data service no longer has two classes of workspace; every upload gets
  the same 100 MB limit.
- One fewer public endpoint that creates rows with no proof of intent, and no
  background sweep to keep alive.
- `auth.test.ts` and `e2e/landing.spec.ts` now assert the path stays gone (404
  on `/api/auth/demo`, no `demo` claim, no no-signup control on the page).
