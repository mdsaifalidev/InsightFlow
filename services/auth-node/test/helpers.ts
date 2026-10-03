import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { inject } from "vitest"

import { buildApp } from "../src/app.js"
import { loadConfig } from "../src/config.js"
import { createDb } from "../src/db/client.js"
import { createMemoryPublisher } from "../src/events.js"
import { loadKeys } from "../src/keys.js"

export async function createTestApp(env: Record<string, string> = {}) {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: inject("databaseUrl"),
    KEYS_DIR: mkdtempSync(path.join(tmpdir(), "auth-keys-")),
    ...env,
  })
  const { db, sql } = createDb(config.DATABASE_URL)
  const keys = await loadKeys(config, () => {})
  const events = createMemoryPublisher()
  const app = await buildApp({ config, db, sql, keys, events })

  return {
    app,
    db,
    sql,
    keys,
    config,
    events,
    /** Empties every auth table between tests. */
    reset: () => sql`truncate auth.users, auth.workspaces, auth.refresh_tokens, auth.audit_logs restart identity cascade`,
    close: async () => {
      await app.close()
      await sql.end()
    },
  }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>

export const alice = { name: "Alice Analyst", email: "Alice@Example.com", password: "correct-horse" }

export async function register(t: TestApp, body: Record<string, unknown> = alice) {
  return t.app.inject({ method: "POST", url: "/api/auth/register", payload: body })
}

export function cookie(res: { cookies: { name: string; value: string }[] }, name: string) {
  return res.cookies.find((c) => c.name === name)
}
