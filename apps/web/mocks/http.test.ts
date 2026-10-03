// @vitest-environment node
import { describe, expect, it } from "vitest"

import { apiFetch, ApiError } from "@/lib/api-client"
import type { DatasetList, UploadResponse } from "@/lib/api/types"
import { setAccessToken } from "@/lib/auth-token"

/** An (unsigned) JWT shaped like the auth service's access tokens. */
function serviceJwt(claims: Record<string, unknown>) {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${encode({ alg: "RS256", kid: "test" })}.${encode(claims)}.signature`
}

describe("mock data layer in hybrid auth mode", () => {
  it("scopes data to the workspace claim of a service-issued JWT", async () => {
    const exp = Math.floor(Date.now() / 1000) + 600
    setAccessToken(serviceJwt({ sub: "user-1", wid: "ws-1", exp }))
    const { dataset } = await apiFetch<UploadResponse>(
      "/api/data/datasets/sample",
      {
        method: "POST",
        body: { key: "saas" },
      }
    )
    expect(
      (await apiFetch<DatasetList>("/api/data/datasets")).items.map((d) => d.id)
    ).toEqual([dataset.id])

    // Another workspace's token sees nothing.
    setAccessToken(serviceJwt({ sub: "user-2", wid: "ws-2", exp }))
    expect((await apiFetch<DatasetList>("/api/data/datasets")).items).toEqual(
      []
    )
  })

  it("rejects expired service tokens", async () => {
    setAccessToken(
      serviceJwt({
        sub: "user-1",
        wid: "ws-1",
        exp: Math.floor(Date.now() / 1000) - 5,
      })
    )
    const error = await apiFetch("/api/data/datasets").catch((e: unknown) => e)
    expect((error as ApiError).status).toBe(401)
  })
})
