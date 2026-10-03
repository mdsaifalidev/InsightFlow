import "@testing-library/jest-dom/vitest"

import { cleanup } from "@testing-library/react"
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest"

import { clearTypedRowCache } from "@/mocks/db/engine/typed-rows"
import { clearRowCache } from "@/mocks/db/rows"
import { mutate, resetDb } from "@/mocks/db/store"
import { server } from "@/mocks/server"

beforeAll(() => server.listen({ onUnhandledRequest: "error" }))

beforeEach(() => {
  resetDb()
  clearRowCache()
  clearTypedRowCache()
  // No artificial latency in tests.
  mutate((s) => {
    s.settings.latencyMs = 0
  })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
})

afterAll(() => server.close())
