import { defineConfig } from "drizzle-kit"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // This service owns only the `auth` schema (ADR-006).
  schemaFilter: ["auth"],
  migrations: { schema: "auth", table: "__drizzle_migrations" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
})
