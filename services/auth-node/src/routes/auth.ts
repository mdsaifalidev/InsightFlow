// /api/auth/* — PRD F1 and the §9 contract (see apps/web/lib/api/types.ts).

import { eq } from "drizzle-orm"
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import type { ZodTypeProvider } from "fastify-type-provider-zod"
import { z } from "zod"

import { audit } from "../audit.js"
import type { Config } from "../config.js"
import type { Database } from "../db/client.js"
import { users, workspaces, type UserRow, type WorkspaceRow } from "../db/schema.js"
import { HttpProblem, problems } from "../errors.js"
import { USER_DELETED, type EventPublisher, type UserDeletedEvent } from "../events.js"
import type { SigningKeys } from "../keys.js"
import { burnPasswordCheck, hashPassword, verifyPassword } from "../password.js"
import { requireAuth } from "../plugins/authenticate.js"
import {
  familyOf,
  issueRefreshToken,
  revokeFamily,
  revokeOtherFamilies,
  rotateRefreshToken,
  signAccessToken,
} from "../tokens.js"

export type AuthDeps = {
  config: Config
  db: Database
  keys: SigningKeys
  events: EventPublisher
}

export const REFRESH_COOKIE = "if_refresh"
/** Tells the web app's proxy a session exists (the refresh cookie is path-scoped). */
export const SESSION_COOKIE = "if_session"

// ---------- Schemas (messages match the web forms) ----------

const email = z
  .string({ error: "Enter a valid email address." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }))
const newPassword = z
  .string({ error: "Use at least 8 characters." })
  .min(8, "Use at least 8 characters.")
  .max(200, "Use at most 200 characters.")
const name = z
  .string({ error: "Enter your name." })
  .trim()
  .min(1, "Enter your name.")
  .max(80, "Use at most 80 characters.")

const User = z.object({ id: z.string(), email: z.string(), name: z.string(), createdAt: z.string() })
const Workspace = z.object({ id: z.string(), name: z.string() })
const AuthResponse = z.object({ user: User, workspace: Workspace, accessToken: z.string() })
const MeResponse = z.object({ user: User, workspace: Workspace })
const RefreshResponse = z.object({ accessToken: z.string() })

// Named ids make the generated types readable (packages/api-types).
z.globalRegistry.add(User, { id: "User" })
z.globalRegistry.add(Workspace, { id: "Workspace" })
z.globalRegistry.add(AuthResponse, { id: "AuthResponse" })
z.globalRegistry.add(MeResponse, { id: "MeResponse" })
z.globalRegistry.add(RefreshResponse, { id: "RefreshResponse" })

const toUser = (row: UserRow) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
})
const toWorkspace = (row: WorkspaceRow) => ({ id: row.id, name: row.name })

function isUniqueViolation(error: unknown) {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code
  return code === "23505"
}

export async function authRoutes(app: FastifyInstance, { config, db, keys, events }: AuthDeps) {
  const r = app.withTypeProvider<ZodTypeProvider>()
  const authenticated = requireAuth(keys, config)
  const client = (request: FastifyRequest) => ({
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  })

  const cookieOptions = (path: string) => ({
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.COOKIE_SECURE,
    path,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400,
  })

  function setSessionCookies(reply: FastifyReply, refreshToken: string) {
    reply.setCookie(REFRESH_COOKIE, refreshToken, cookieOptions("/api/auth"))
    reply.setCookie(SESSION_COOKIE, "1", cookieOptions("/"))
  }

  function clearSessionCookies(reply: FastifyReply) {
    reply.clearCookie(REFRESH_COOKIE, { path: "/api/auth" })
    reply.clearCookie(SESSION_COOKIE, { path: "/" })
  }

  async function workspaceOf(userId: string) {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1)
    if (!workspace) throw new HttpProblem(500, "Workspace missing", "Your account has no workspace.")
    return workspace
  }

  async function startSession(request: FastifyRequest, reply: FastifyReply, user: UserRow, workspace: WorkspaceRow) {
    const { token } = await issueRefreshToken(db, config, user.id, client(request))
    setSessionCookies(reply, token)
    return {
      user: toUser(user),
      workspace: toWorkspace(workspace),
      accessToken: await signAccessToken(keys, config, {
        sub: user.id,
        wid: workspace.id,
      }),
    }
  }

  r.post(
    "/register",
    {
      schema: {
        operationId: "register",
        tags: ["auth"],
        summary: "Create an account and its personal workspace",
        body: z.object({ name, email, password: newPassword }),
        response: { 201: AuthResponse, ...problems(409, 422, 429) },
      },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const { name, email, password } = request.body
      const passwordHash = await hashPassword(password)
      let created: { user: UserRow; workspace: WorkspaceRow }
      try {
        created = await db.transaction(async (tx) => {
          const [user] = await tx.insert(users).values({ name, email, passwordHash }).returning()
          const [workspace] = await tx
            .insert(workspaces)
            .values({ ownerId: user!.id, name: `${name.split(/\s+/)[0]}'s workspace` })
            .returning()
          return { user: user!, workspace: workspace! }
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new HttpProblem(409, "Email already registered", undefined, {
            email: "An account with this email already exists. Sign in instead.",
          })
        }
        throw error
      }
      await audit(db, request, "register", created.user.id)
      return reply.code(201).send(await startSession(request, reply, created.user, created.workspace))
    }
  )

  r.post(
    "/login",
    {
      schema: {
        operationId: "login",
        tags: ["auth"],
        summary: "Sign in with email and password",
        body: z.object({
          email,
          password: z.string({ error: "Enter your password." }).min(1, "Enter your password."),
        }),
        response: { 200: AuthResponse, ...problems(401, 422, 429) },
      },
      config: {
        rateLimit: {
          max: config.LOGIN_RATE_LIMIT_PER_MINUTE,
          timeWindow: "1 minute",
          // Per IP + email (PRD F1), so one attacker can't lock out everyone.
          keyGenerator: (request) => `${request.ip}:${String((request.body as { email?: string })?.email ?? "").toLowerCase()}`,
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body
      const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
      if (!user) await burnPasswordCheck(password)
      if (!user || !(await verifyPassword(user.passwordHash, password))) {
        await audit(db, request, "login_failed", user?.id ?? null, { email })
        throw new HttpProblem(401, "Invalid credentials", "Email or password is incorrect.")
      }
      await audit(db, request, "login", user.id)
      return startSession(request, reply, user, await workspaceOf(user.id))
    }
  )

  r.post(
    "/refresh",
    {
      schema: {
        operationId: "refresh",
        tags: ["auth"],
        summary: "Rotate the refresh cookie and get a new access token",
        response: { 200: RefreshResponse, ...problems(401, 429) },
      },
      config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE]
      if (!token) throw new HttpProblem(401, "Unauthorized", "No active session.")

      const result = await rotateRefreshToken(db, config, token, client(request))
      if (result.status !== "ok") {
        clearSessionCookies(reply)
        if (result.status === "reuse") {
          await audit(db, request, "refresh_reuse", result.userId, { familyId: result.familyId })
        }
        throw new HttpProblem(401, "Unauthorized", "Your session has expired. Sign in again.")
      }
      setSessionCookies(reply, result.token)
      const workspace = await workspaceOf(result.userId)
      return {
        accessToken: await signAccessToken(keys, config, {
          sub: result.userId,
          wid: workspace.id,
        }),
      }
    }
  )

  r.post(
    "/logout",
    {
      schema: {
        operationId: "logout",
        tags: ["auth"],
        summary: "Sign out this session",
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE]
      const family = token ? await familyOf(db, token) : null
      if (family) {
        await revokeFamily(db, family.familyId)
        await audit(db, request, "logout", family.userId)
      }
      clearSessionCookies(reply)
      return reply.code(204).send(null)
    }
  )

  r.get(
    "/me",
    {
      schema: {
        operationId: "getMe",
        tags: ["auth"],
        summary: "Current user and workspace",
        security: [{ bearerAuth: [] }],
        response: { 200: MeResponse, ...problems(401) },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const [user] = await db.select().from(users).where(eq(users.id, request.auth!.sub)).limit(1)
      if (!user) throw new HttpProblem(401, "Unauthorized", "Your account no longer exists.")
      return { user: toUser(user), workspace: toWorkspace(await workspaceOf(user.id)) }
    }
  )

  r.patch(
    "/me",
    {
      schema: {
        operationId: "updateMe",
        tags: ["auth"],
        summary: "Update name or password",
        security: [{ bearerAuth: [] }],
        body: z.object({
          name: name.optional(),
          currentPassword: z.string().optional(),
          newPassword: newPassword.optional(),
        }),
        response: { 200: MeResponse, ...problems(401, 422) },
      },
      preHandler: authenticated,
    },
    async (request) => {
      const [user] = await db.select().from(users).where(eq(users.id, request.auth!.sub)).limit(1)
      if (!user) throw new HttpProblem(401, "Unauthorized", "Your account no longer exists.")
      const { name, currentPassword, newPassword } = request.body

      let passwordHash: string | undefined
      if (newPassword !== undefined) {
        if (!currentPassword || !(await verifyPassword(user.passwordHash, currentPassword))) {
          throw new HttpProblem(422, "Validation failed", undefined, {
            currentPassword: "Current password is incorrect.",
          })
        }
        passwordHash = await hashPassword(newPassword)
      }

      const [updated] = await db
        .update(users)
        .set({ ...(name ? { name } : {}), ...(passwordHash ? { passwordHash } : {}), updatedAt: new Date() })
        .where(eq(users.id, user.id))
        .returning()

      if (passwordHash) {
        // Keep this browser signed in; sign out every other session.
        const token = request.cookies[REFRESH_COOKIE]
        const family = token ? await familyOf(db, token) : null
        await revokeOtherFamilies(db, user.id, family?.familyId ?? null)
        await audit(db, request, "password_changed", user.id)
      }
      if (name) await audit(db, request, "profile_updated", user.id)
      return { user: toUser(updated!), workspace: toWorkspace(await workspaceOf(user.id)) }
    }
  )

  r.delete(
    "/me",
    {
      schema: {
        operationId: "deleteMe",
        tags: ["auth"],
        summary: "Delete the account and everything in its workspace",
        security: [{ bearerAuth: [] }],
        response: { 204: z.null(), ...problems(401) },
      },
      preHandler: authenticated,
    },
    async (request, reply) => {
      const { sub: userId, wid: workspaceId } = request.auth!
      await db.delete(users).where(eq(users.id, userId))
      await audit(db, request, "account_deleted", null, { userId, workspaceId })
      const event: UserDeletedEvent = { userId, workspaceId, at: new Date().toISOString() }
      try {
        await events.publish(USER_DELETED, event)
      } catch (error) {
        // The account is gone either way; the data service can reconcile later.
        request.log.error({ err: error }, "Failed to publish user.deleted")
      }
      clearSessionCookies(reply)
      return reply.code(204).send(null)
    }
  )
}
