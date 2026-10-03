import { isNull } from "drizzle-orm"
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { auditLogs, refreshTokens, users } from "../src/db/schema.js"
import { USER_DELETED } from "../src/events.js"
import { REFRESH_COOKIE, SESSION_COOKIE } from "../src/routes/auth.js"
import { alice, cookie, createTestApp, register, type TestApp } from "./helpers.js"

let t: TestApp

beforeAll(async () => {
  t = await createTestApp()
})
beforeEach(async () => {
  await t.reset()
  t.events.published.length = 0
})
afterAll(async () => {
  await t.close()
})

const auditActions = async () =>
  (await t.db.select({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.id)).map((r) => r.action)

describe("register", () => {
  it("creates a user with a personal workspace, a session and an access token", async () => {
    const res = await register(t)
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.user).toMatchObject({ email: "alice@example.com", name: "Alice Analyst" })
    expect(body.workspace.name).toBe("Alice's workspace")

    // Access token: RS256, verifiable with the published JWKS, carries wid.
    const jwks = (await t.app.inject({ url: "/api/auth/.well-known/jwks.json" })).json()
    const { payload } = await jwtVerify(body.accessToken, createLocalJWKSet(jwks), {
      issuer: "insightflow-auth",
      audience: "insightflow",
    })
    expect(payload).toMatchObject({ sub: body.user.id, wid: body.workspace.id })
    expect(decodeProtectedHeader(body.accessToken)).toMatchObject({ alg: "RS256", kid: t.keys.kid })

    // Refresh cookie is httpOnly and scoped to the auth API.
    expect(cookie(res, REFRESH_COOKIE)).toMatchObject({ httpOnly: true, path: "/api/auth", sameSite: "Lax" })
    expect(cookie(res, SESSION_COOKIE)).toMatchObject({ value: "1", path: "/", httpOnly: true })

    // Passwords are stored as Argon2id hashes.
    const [row] = await t.db.select().from(users)
    expect(row!.passwordHash).toMatch(/^\$argon2id\$/)
    expect(await auditActions()).toEqual(["register"])
  })

  it("returns field errors in the web's 422 shape", async () => {
    const res = await register(t, { name: "", email: "nope", password: "short" })
    expect(res.statusCode).toBe(422)
    expect(res.headers["content-type"]).toContain("application/problem+json")
    expect(res.json().errors).toEqual({
      name: "Enter your name.",
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
    })
  })

  it("rejects a duplicate email case-insensitively", async () => {
    await register(t)
    const res = await register(t, { ...alice, email: "ALICE@example.com" })
    expect(res.statusCode).toBe(409)
    expect(res.json().errors.email).toMatch(/already exists/)
  })
})

describe("login", () => {
  beforeEach(async () => {
    await register(t)
  })

  it("signs in with the right password", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@example.com", password: alice.password },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().user.email).toBe("alice@example.com")
    expect(cookie(res, REFRESH_COOKIE)?.value).toBeTruthy()
  })

  it("rejects a wrong password and audits it", async () => {
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: alice.email, password: "wrong-password" },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().detail).toBe("Email or password is incorrect.")
    expect(await auditActions()).toEqual(["register", "login_failed"])
  })

  it("rate-limits repeated attempts per IP and email", async () => {
    const attempt = () =>
      t.app.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: { email: "limited@example.com", password: "whatever-123" },
      })
    const statuses: number[] = []
    for (let i = 0; i < 6; i++) statuses.push((await attempt()).statusCode)
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429])
  })
})

describe("sessions", () => {
  it("rotates the refresh token and detects reuse of an old one", async () => {
    const first = cookie(await register(t), REFRESH_COOKIE)!.value

    const refreshed = await t.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_COOKIE]: first },
    })
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.json().accessToken).toBeTruthy()
    const second = cookie(refreshed, REFRESH_COOKIE)!.value
    expect(second).not.toBe(first)

    // Replaying the rotated token revokes the whole family...
    const replay = await t.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_COOKIE]: first },
    })
    expect(replay.statusCode).toBe(401)
    expect(await auditActions()).toContain("refresh_reuse")

    // ...so even the latest token no longer works.
    const afterReuse = await t.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_COOKIE]: second },
    })
    expect(afterReuse.statusCode).toBe(401)
    // Every token in the family is revoked (IS NULL, not = NULL).
    expect(await t.db.select().from(refreshTokens)).toHaveLength(2)
    expect(await t.db.select().from(refreshTokens).where(isNull(refreshTokens.revokedAt))).toHaveLength(0)
  })

  it("logs out by revoking the session and clearing cookies", async () => {
    const token = cookie(await register(t), REFRESH_COOKIE)!.value
    const res = await t.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { [REFRESH_COOKIE]: token },
    })
    expect(res.statusCode).toBe(204)
    expect(cookie(res, REFRESH_COOKIE)?.value).toBe("")
    const again = await t.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { [REFRESH_COOKIE]: token },
    })
    expect(again.statusCode).toBe(401)
  })
})

describe("me", () => {
  it("requires a valid bearer token", async () => {
    expect((await t.app.inject({ url: "/api/auth/me" })).statusCode).toBe(401)
    const bad = await t.app.inject({ url: "/api/auth/me", headers: { authorization: "Bearer nope" } })
    expect(bad.statusCode).toBe(401)
  })

  it("updates the name and changes the password, signing out other sessions", async () => {
    const reg = await register(t)
    const { accessToken } = reg.json()
    const here = cookie(reg, REFRESH_COOKIE)!.value
    const elsewhere = cookie(
      await t.app.inject({ method: "POST", url: "/api/auth/login", payload: { email: alice.email, password: alice.password } }),
      REFRESH_COOKIE
    )!.value
    const headers = { authorization: `Bearer ${accessToken}` }

    const wrong = await t.app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers,
      payload: { currentPassword: "nope", newPassword: "another-pass" },
    })
    expect(wrong.statusCode).toBe(422)
    expect(wrong.json().errors).toEqual({ currentPassword: "Current password is incorrect." })

    const ok = await t.app.inject({
      method: "PATCH",
      url: "/api/auth/me",
      headers,
      cookies: { [REFRESH_COOKIE]: here },
      payload: { name: "Alice A.", currentPassword: alice.password, newPassword: "another-pass" },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().user.name).toBe("Alice A.")

    const refresh = (token: string) =>
      t.app.inject({ method: "POST", url: "/api/auth/refresh", cookies: { [REFRESH_COOKIE]: token } })
    expect((await refresh(here)).statusCode).toBe(200)
    expect((await refresh(elsewhere)).statusCode).toBe(401)
  })

  it("deletes the account, keeps the audit trail and announces the deletion", async () => {
    const { accessToken, user, workspace } = (await register(t)).json()
    const res = await t.app.inject({
      method: "DELETE",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(204)
    expect(await t.db.select().from(users)).toHaveLength(0)
    expect(await auditActions()).toEqual(["register", "account_deleted"])
    expect(t.events.published).toEqual([
      { channel: USER_DELETED, payload: expect.objectContaining({ userId: user.id, workspaceId: workspace.id }) },
    ])
  })
})

describe("meta", () => {
  it("serves health, readiness and an OpenAPI document", async () => {
    expect((await t.app.inject({ url: "/health" })).json()).toEqual({ status: "ok" })
    expect((await t.app.inject({ url: "/ready" })).statusCode).toBe(200)
    const openapi = (await t.app.inject({ url: "/api/auth/openapi.json" })).json()
    expect(Object.keys(openapi.paths)).toEqual(
      expect.arrayContaining(["/api/auth/register", "/api/auth/login", "/api/auth/refresh", "/api/auth/me"])
    )
    // The spec generates the web app's types (packages/api-types), so it must
    // name its schemas and describe the error bodies too.
    expect(Object.keys(openapi.components.schemas)).toEqual(
      expect.arrayContaining(["AuthResponse", "MeResponse", "Problem", "User", "Workspace"])
    )
    const register = openapi.paths["/api/auth/register"].post
    expect(register.operationId).toBe("register")
    expect(register.responses["422"].content["application/json"].schema.$ref).toContain("Problem")
    expect(openapi.paths["/api/auth/me"].get.security).toEqual([{ bearerAuth: [] }])
  })

  it("returns RFC 7807 problems with the request id for unknown routes", async () => {
    const res = await t.app.inject({ url: "/api/auth/nope", headers: { "x-request-id": "req-123" } })
    expect(res.statusCode).toBe(404)
    expect(res.headers["x-request-id"]).toBe("req-123")
    expect(res.json()).toMatchObject({ status: 404, title: "Not found" })
  })
})

describe("no account without credentials", () => {
  // ADR-015 removed the public demo. This is the guard against it creeping
  // back: the only ways in are /register and /login.
  it("has no demo endpoint, and the spec does not advertise one", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/auth/demo" })
    expect(res.statusCode).toBe(404)

    const openapi = (await t.app.inject({ url: "/api/auth/openapi.json" })).json()
    expect(Object.keys(openapi.paths).filter((path) => path.includes("demo"))).toEqual([])
  })

  it("issues access tokens with no demo claim", async () => {
    const body = (await register(t)).json()
    expect(decodeJwt(body.accessToken)).not.toHaveProperty("demo")
  })
})
