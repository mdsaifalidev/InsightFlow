import { buildApp } from "./app.js"
import { loadConfig } from "./config.js"
import { createDb } from "./db/client.js"
import { createMemoryPublisher, createRedisPublisher } from "./events.js"
import { loadKeys } from "./keys.js"

const config = loadConfig()
const { db, sql } = createDb(config.DATABASE_URL)
const keys = await loadKeys(config)
// Without Redis the user.deleted event never leaves this process, so the data
// service never purges the workspace. Fine locally, wrong in production.
if (!config.REDIS_URL && config.NODE_ENV === "production") {
  console.warn("REDIS_URL is unset: rate limits are per-process and user.deleted stays local.")
}
const events = config.REDIS_URL ? createRedisPublisher(config.REDIS_URL) : createMemoryPublisher()

const app = await buildApp({ config, db, sql, keys, events })

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down")
  await app.close()
  await events.close()
  await sql.end({ timeout: 5 })
  process.exit(0)
}
process.on("SIGTERM", () => void shutdown("SIGTERM"))
process.on("SIGINT", () => void shutdown("SIGINT"))

await app.listen({ host: config.HOST, port: config.PORT })
app.log.info({ kid: keys.kid }, "Auth service ready")
