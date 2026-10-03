// Applies migrations in ./drizzle to the `auth` schema. Run before the server.
import { loadConfig } from "../src/config.js"
import { createDb, runMigrations } from "../src/db/client.js"

const config = loadConfig()
const { db, sql } = createDb(config.DATABASE_URL)
try {
  await runMigrations(db)
  console.log("auth migrations applied")
} finally {
  await sql.end({ timeout: 5 })
}
