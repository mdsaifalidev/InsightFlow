// Postgres schema `auth`, owned by this service only (ADR-006).

import { sql } from "drizzle-orm"
import {
  bigserial,
  customType,
  index,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

/** Case-insensitive text (extension created by infra/postgres/init). */
const citext = customType<{ data: string }>({
  dataType: () => "citext",
})

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}

export const auth = pgSchema("auth")

export const users = auth.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const workspaces = auth.table(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ...timestamps,
  },
  (t) => [index("workspaces_owner_idx").on(t.ownerId)]
)

/**
 * Rotating refresh tokens (ADR-007). Only a SHA-256 of the token is stored.
 * Tokens from one login share a family; reusing a rotated token revokes it.
 */
export const refreshTokens = auth.table(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedBy: uuid("replaced_by"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (t) => [
    index("refresh_tokens_user_idx").on(t.userId),
    index("refresh_tokens_family_idx").on(t.familyId),
  ]
)

export const auditLogs = auth.table(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // Kept after account deletion (set null) so the trail survives.
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (t) => [index("audit_logs_user_created_idx").on(t.userId, t.createdAt.desc())]
)

export type UserRow = typeof users.$inferSelect
export type WorkspaceRow = typeof workspaces.$inferSelect
