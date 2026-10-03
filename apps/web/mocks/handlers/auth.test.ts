import { beforeEach, describe, expect, it } from "vitest"

import { apiFetch, ApiError } from "@/lib/api-client"
import type { AuthResponse, MeResponse } from "@/lib/api/types"
import {
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from "@/lib/auth-token"

const maya = {
  name: "Maya Chen",
  email: "maya@example.com",
  password: "correct-horse",
}

async function register() {
  const res = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: maya,
  })
  setAccessToken(res.accessToken)
  return res
}

describe("mock auth service", () => {
  beforeEach(() => setAccessToken(null))

  it("registers a user with a personal workspace and returns a token", async () => {
    const res = await register()
    expect(res.user.email).toBe(maya.email)
    expect(res.workspace.name).toBe("Maya's workspace")
    expect(res.accessToken).toMatch(/^mock\./)

    const me = await apiFetch<MeResponse>("/api/auth/me")
    expect(me.user.id).toBe(res.user.id)
  })

  it("rejects a duplicate email with a field error", async () => {
    await register()
    const error = await apiFetch("/api/auth/register", {
      method: "POST",
      body: maya,
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(409)
    expect((error as ApiError).problem.errors?.email).toMatch(/already exists/)
  })

  it("rejects a wrong password", async () => {
    await register()
    const error = await apiFetch("/api/auth/login", {
      method: "POST",
      body: { email: maya.email, password: "wrong-password" },
    }).catch((e: unknown) => e)
    expect((error as ApiError).status).toBe(401)
  })

  it("restores the session with refresh until logout", async () => {
    await register()
    setAccessToken(null)

    expect(await refreshAccessToken()).toBe(true)
    expect(getAccessToken()).toMatch(/^mock\./)

    await apiFetch("/api/auth/logout", { method: "POST" })
    expect(await refreshAccessToken()).toBe(false)
    expect(getAccessToken()).toBeNull()
  })

  it("refreshes and retries once when the access token is rejected", async () => {
    await register()
    setAccessToken("mock.expired-or-garbage")

    const me = await apiFetch<MeResponse>("/api/auth/me")
    expect(me.user.email).toBe(maya.email)
    expect(getAccessToken()).not.toBe("mock.expired-or-garbage")
  })
})
