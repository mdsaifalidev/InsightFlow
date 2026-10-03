// Mock-only endpoints (not part of the PRD contract): demo controls used by
// Settings when NEXT_PUBLIC_API_MOCKING is enabled.

import { http, HttpResponse } from "msw"

import { clearTypedRowCache } from "../db/engine/typed-rows"
import { clearRowCache } from "../db/rows"
import { db, mutate, resetDb, type MockSettings } from "../db/store"

export const mockHandlers = [
  http.get("*/api/mock/settings", () => HttpResponse.json(db().settings)),

  http.patch("*/api/mock/settings", async ({ request }) => {
    const patch = (await request.json()) as Partial<MockSettings>
    const settings = mutate((s) => {
      if (typeof patch.latencyMs === "number") {
        s.settings.latencyMs = Math.max(0, Math.min(5000, patch.latencyMs))
      }
      if (typeof patch.failNextUpload === "boolean") {
        s.settings.failNextUpload = patch.failNextUpload
      }
      return { ...s.settings }
    })
    return HttpResponse.json(settings)
  }),

  http.post("*/api/mock/reset", () => {
    resetDb()
    clearRowCache()
    clearTypedRowCache()
    return new HttpResponse(null, { status: 204 })
  }),
]
