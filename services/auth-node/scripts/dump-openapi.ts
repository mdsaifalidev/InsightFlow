// Writes the OpenAPI spec to packages/api-types/openapi/auth.json.
// The app is built with stub dependencies: generating the document only needs
// the route schemas, never a database or Redis.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { buildApp } from "../src/app.js"
import type { Config } from "../src/config.js"
import type { Database } from "../src/db/client.js"
import { createMemoryPublisher } from "../src/events.js"
import { generatePemPair, loadKeys } from "../src/keys.js"

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/api-types/openapi/auth.json"
)

const pair = await generatePemPair()
const config = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 4000,
  LOG_LEVEL: "silent",
  DATABASE_URL: "postgres://spec:spec@127.0.0.1:5432/spec",
  WEB_ORIGIN: "http://localhost:3000",
  COOKIE_SECURE: false,
  JWT_ISSUER: "insightflow-auth",
  JWT_AUDIENCE: "insightflow",
  JWT_PRIVATE_KEY: pair.privateKey,
  JWT_PUBLIC_KEY: pair.publicKey,
  KEYS_DIR: ".keys",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 7,
  LOGIN_RATE_LIMIT_PER_MINUTE: 5,
} as Config

const app = await buildApp({
  config,
  db: {} as Database,
  sql: (() => {}) as never,
  keys: await loadKeys(config),
  events: createMemoryPublisher(),
})
await app.ready()

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(app.swagger(), null, 2)}\n`)
await app.close()
console.log(`auth spec written to ${out}`)
