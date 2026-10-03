# ADR-007: Custom JWT (RS256 + JWKS) issued by the Node service

**Status:** Accepted · 2026-09-21

## Context
Auth must live in the Node service (per the architecture), and the Python service must authorize requests without a network call per request.

## Decision
- The Node service issues **RS256 access tokens (15 min)** with `jose`, with claims `sub`, `wid` (workspace id), `exp`, `iat`, and a `kid` header.
- **Rotating refresh tokens (7 days)** live in an httpOnly Secure SameSite=Lax cookie and are stored hashed, with family-based reuse detection.
- The Node service exposes a **JWKS** endpoint. The Python service caches the keys and verifies tokens locally.

## Consequences
- Stateless verification in every service, with key rotation through `kid`.
- More code than using an auth library, which is also a deliberate learning and showcase point.
- The access token is kept in memory on the client, and a silent refresh runs on page load.

## Addendum (Phase 3, 2026-09-22)
- **Session indicator cookie.** The refresh cookie `if_refresh` is scoped to `path=/api/auth`, so the web server can't see it on `/app/*`. The service also sets `if_session=1` (httpOnly, `path=/`, same lifetime). Next's `proxy.ts` only checks that it exists, to redirect server-side. It holds no secret; the refresh cookie remains the credential.
- **Hashing** uses `@node-rs/argon2` (Argon2id, m=19456 KiB, t=2, p=1, the OWASP baseline). It ships prebuilt binaries: no node-gyp and no pnpm build-script approval. A failed login for an unknown email still runs a hash, to equalize timing.
- **Keys.** In production the PEMs come from env (`JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_KEY_ID`); boot fails without them. In development a key pair is generated on first boot into `KEYS_DIR` (a Docker volume). The `kid` is the JWK thumbprint.
- **Migrations** run as the service role. `CREATE SCHEMA IF NOT EXISTS` checks the CREATE privilege on the database before it checks existence, so the init script grants `CREATE ON DATABASE` to each service role.
