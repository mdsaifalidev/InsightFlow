import type { FastifyRequest } from "fastify"

import type { Database } from "./db/client.js"
import { auditLogs } from "./db/schema.js"

export type AuditAction =
  | "register"
  | "login"
  | "login_failed"
  | "logout"
  | "refresh_reuse"
  | "password_changed"
  | "profile_updated"
  | "account_deleted"

/** Security events for PRD F1 (auth.audit_logs). Failures never block the request. */
export async function audit(
  db: Database,
  request: FastifyRequest,
  action: AuditAction,
  userId: string | null,
  metadata: Record<string, unknown> = {}
) {
  try {
    await db.insert(auditLogs).values({
      userId,
      action,
      ip: request.ip,
      userAgent: request.headers["user-agent"] ?? null,
      metadata: { requestId: request.id, ...metadata },
    })
  } catch (error) {
    request.log.error({ err: error, action }, "Failed to write audit log")
  }
}
