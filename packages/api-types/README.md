# @workspace/api-types

Types generated from the services' OpenAPI specs, so the web app and the
services cannot drift apart (PRD §7).

- `openapi/auth.json` — dumped from Fastify's zod route schemas
  (`services/auth-node/scripts/dump-openapi.ts`).
- `openapi/data.json` — dumped from FastAPI's response models
  (`services/data-py/scripts/dump_openapi.py`).
- `src/auth.d.ts`, `src/data.d.ts` — `openapi-typescript` output.

Both the specs and the generated types are committed, so regenerating is a
no-op diff unless a service really changed:

```bash
pnpm --filter @workspace/api-types generate   # needs no database or Redis
git diff --exit-code                          # what CI runs
```

`apps/web/lib/api/contract.ts` asserts the hand-written contract types against
these, so a drift fails `pnpm typecheck` with the field that moved.
