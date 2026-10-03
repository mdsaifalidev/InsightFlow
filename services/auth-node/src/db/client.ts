import path from "node:path"

import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import postgres from "postgres"

import * as schema from "./schema.js"

export function createDb(url: string) {
  const sql = postgres(url, { max: 10, onnotice: () => {} })
  const db = drizzle(sql, { schema })
  return { db, sql }
}

export type Database = ReturnType<typeof createDb>["db"]

/** Applies drizzle-kit migrations; the bookkeeping table lives in `auth` too. */
export async function runMigrations(db: Database, folder = process.env.MIGRATIONS_DIR ?? "drizzle") {
  await migrate(db, {
    migrationsFolder: path.resolve(folder),
    migrationsSchema: "auth",
    migrationsTable: "__drizzle_migrations",
  })
}
