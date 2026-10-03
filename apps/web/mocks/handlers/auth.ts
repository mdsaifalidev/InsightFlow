import { http, HttpResponse } from "msw"

import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  UpdateMeRequest,
} from "@/lib/api/types"

import { db, mutate, newId, nowIso, type MockUser } from "../db/store"
import {
  REFRESH_TTL_MS,
  hashPassword,
  issueAccessToken,
  latency,
  problem,
  requireAuth,
  toPublicUser,
} from "../http"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function startSession(user: MockUser) {
  mutate((s) => {
    const session = {
      id: newId(),
      userId: user.id,
      expiresAt: Date.now() + REFRESH_TTL_MS,
    }
    s.sessions.push(session)
    s.currentSessionId = session.id
  })
}

function authResponse(user: MockUser, status = 200) {
  const workspace = db().workspaces.find((w) => w.id === user.workspaceId)!
  const body: AuthResponse = {
    user: toPublicUser(user),
    workspace,
    accessToken: issueAccessToken(user),
  }
  return HttpResponse.json(body, { status })
}

export const authHandlers = [
  http.post("*/api/auth/register", async ({ request }) => {
    await latency()
    const body = (await request.json()) as Partial<RegisterRequest>
    const name = body.name?.trim() ?? ""
    const email = body.email?.trim().toLowerCase() ?? ""
    const password = body.password ?? ""

    const errors: Record<string, string> = {}
    if (!name) errors.name = "Enter your name."
    if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address."
    if (password.length < 8) errors.password = "Use at least 8 characters."
    if (Object.keys(errors).length) {
      return problem(
        422,
        "Validation failed",
        "Check the highlighted fields.",
        errors
      )
    }
    if (db().users.some((u) => u.email === email)) {
      return problem(409, "Email already registered", undefined, {
        email: "An account with this email already exists. Sign in instead.",
      })
    }

    const passwordHash = await hashPassword(password)
    const user = mutate((s) => {
      const workspace = {
        id: newId(),
        name: `${name.split(" ")[0]}'s workspace`,
      }
      const created: MockUser = {
        id: newId(),
        email,
        name,
        passwordHash,
        workspaceId: workspace.id,
        createdAt: nowIso(),
      }
      s.workspaces.push(workspace)
      s.users.push(created)
      return created
    })
    startSession(user)
    return authResponse(user, 201)
  }),

  http.post("*/api/auth/login", async ({ request }) => {
    await latency()
    const body = (await request.json()) as Partial<LoginRequest>
    const email = body.email?.trim().toLowerCase() ?? ""
    const user = db().users.find((u) => u.email === email)
    if (
      !user ||
      user.passwordHash !== (await hashPassword(body.password ?? ""))
    ) {
      return problem(
        401,
        "Invalid credentials",
        "Email or password is incorrect."
      )
    }
    startSession(user)
    return authResponse(user)
  }),

  http.post("*/api/auth/refresh", async () => {
    await latency(0.5)
    const { currentSessionId, sessions, users } = db()
    const session = sessions.find((s) => s.id === currentSessionId)
    const user = session && users.find((u) => u.id === session.userId)
    if (!session || !user || session.expiresAt < Date.now()) {
      return problem(401, "Unauthorized", "No active session.")
    }
    return HttpResponse.json({ accessToken: issueAccessToken(user) })
  }),

  http.post("*/api/auth/logout", async () => {
    await latency(0.5)
    mutate((s) => {
      s.sessions = s.sessions.filter((x) => x.id !== s.currentSessionId)
      s.currentSessionId = null
    })
    return new HttpResponse(null, { status: 204 })
  }),

  http.get("*/api/auth/me", async ({ request }) => {
    await latency(0.5)
    const { user, workspace } = requireAuth(request)
    const body: MeResponse = { user: toPublicUser(user), workspace }
    return HttpResponse.json(body)
  }),

  http.patch("*/api/auth/me", async ({ request }) => {
    await latency()
    const { user } = requireAuth(request)
    const body = (await request.json()) as UpdateMeRequest

    if (body.newPassword !== undefined) {
      if (
        (await hashPassword(body.currentPassword ?? "")) !== user.passwordHash
      ) {
        return problem(422, "Validation failed", undefined, {
          currentPassword: "Current password is incorrect.",
        })
      }
      if (body.newPassword.length < 8) {
        return problem(422, "Validation failed", undefined, {
          newPassword: "Use at least 8 characters.",
        })
      }
    }
    const newHash =
      body.newPassword !== undefined
        ? await hashPassword(body.newPassword)
        : null
    const name = body.name?.trim()
    if (name !== undefined && !name) {
      return problem(422, "Validation failed", undefined, {
        name: "Enter your name.",
      })
    }

    const updated = mutate((s) => {
      const target = s.users.find((u) => u.id === user.id)!
      if (name) target.name = name
      if (newHash) target.passwordHash = newHash
      return target
    })
    const workspace = db().workspaces.find((w) => w.id === updated.workspaceId)!
    return HttpResponse.json({ user: toPublicUser(updated), workspace })
  }),

  http.delete("*/api/auth/me", async ({ request }) => {
    await latency()
    const { user } = requireAuth(request)
    mutate((s) => {
      const datasetIds = new Set(
        s.datasets
          .filter((d) => d.workspaceId === user.workspaceId)
          .map((d) => d.id)
      )
      s.datasets = s.datasets.filter((d) => !datasetIds.has(d.id))
      s.widgets = s.widgets.filter((w) => !datasetIds.has(w.datasetId))
      s.insights = s.insights.filter((i) => !datasetIds.has(i.datasetId))
      s.jobs = s.jobs.filter((j) => !datasetIds.has(j.datasetId))
      datasetIds.forEach((id) => delete s.columns[id])
      s.users = s.users.filter((u) => u.id !== user.id)
      s.workspaces = s.workspaces.filter((w) => w.id !== user.workspaceId)
      s.sessions = s.sessions.filter((x) => x.userId !== user.id)
      s.currentSessionId = null
    })
    return new HttpResponse(null, { status: 204 })
  }),

  http.get("*/api/auth/.well-known/jwks.json", () =>
    HttpResponse.json({ keys: [] })
  ),
]
