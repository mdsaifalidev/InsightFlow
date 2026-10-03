import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql"
import type { TestProject } from "vitest/node"

import { createDb, runMigrations } from "../src/db/client.js"

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string
  }
}

let container: StartedPostgreSqlContainer | undefined

/** One real Postgres 17 for the whole run, migrated with the service's own migrations. */
export default async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:17-alpine").start()
  const url = container.getConnectionUri()
  const { db, sql } = createDb(url)
  await runMigrations(db)
  await sql.end()
  project.provide("databaseUrl", url)

  return async () => {
    await container?.stop()
  }
}
