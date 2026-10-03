// Shared helpers for MSW handlers: RFC 7807 errors, latency, mock auth.

import { delay, HttpResponse } from "msw"

import type { User, Workspace } from "@/lib/api/types"

import { db, type MockUser } from "./db/store"

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000
export const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function problem(
  status: number,
  title: string,
  detail?: string,
  errors?: Record<string, string>
) {
  return HttpResponse.json(
    { type: "about:blank", title, status, detail, errors },
    { status, headers: { "Content-Type": "application/problem+json" } }
  )
}

/** Simulated network + server time, configurable from mock controls. */
export async function latency(multiplier = 1) {
  const base = db().settings.latencyMs
  if (base <= 0) return
  const jitter = Math.random() * base * 0.4
  await delay(Math.round((base + jitter) * multiplier))
}

// Mock access tokens look like "mock.<base64url(json)>". They are opaque to
// the client, exactly like the real RS256 JWTs.
type TokenClaims = { sub: string; wid: string; exp: number }

export function issueAccessToken(user: MockUser) {
  const claims: TokenClaims = {
    sub: user.id,
    wid: user.workspaceId,
    exp: Date.now() + ACCESS_TOKEN_TTL_MS,
  }
  return `mock.${btoa(JSON.stringify(claims))}`
}

function bearer(request: Request) {
  const header = request.headers.get("Authorization")
  return header?.startsWith("Bearer ") ? header.slice(7) : null
}

function readMockToken(token: string): TokenClaims | null {
  if (!token.startsWith("mock.")) return null
  try {
    const claims = JSON.parse(atob(token.slice(5))) as TokenClaims
    return claims.exp > Date.now() ? claims : null
  } catch {
    return null
  }
}

/**
 * Claims of a JWT issued by the real auth service (hybrid mode, ADR-013).
 * The mock data layer only *decodes* it: signature verification belongs to
 * the real data service, which checks tokens against the JWKS (Phase 4).
 */
function readServiceJwt(token: string): { sub: string; wid: string } | null {
  const parts = token.split(".")
  if (parts.length !== 3) return null
  try {
    const json = atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(json) as {
      sub?: string
      wid?: string
      exp?: number
    }
    if (
      !claims.sub ||
      !claims.wid ||
      !claims.exp ||
      claims.exp * 1000 <= Date.now()
    )
      return null
    return { sub: claims.sub, wid: claims.wid }
  } catch {
    return null
  }
}

export type AuthContext = { user: MockUser; workspace: Workspace }

/** Resolves the caller from the Bearer token or throws a 401 response. */
export function requireAuth(request: Request): AuthContext {
  const token = bearer(request)
  const unauthorized = () =>
    problem(401, "Unauthorized", "Your session has expired. Sign in again.")
  if (!token) throw unauthorized()

  const service = readServiceJwt(token)
  if (service) {
    // Accounts live in the auth service; the mock only needs the workspace.
    return {
      user: {
        id: service.sub,
        email: "",
        name: "",
        passwordHash: "",
        workspaceId: service.wid,
        createdAt: "",
      },
      workspace: { id: service.wid, name: "" },
    }
  }

  const claims = readMockToken(token)
  const user = claims && db().users.find((u) => u.id === claims.sub)
  const workspace =
    user && db().workspaces.find((w) => w.id === user.workspaceId)
  if (!user || !workspace) throw unauthorized()
  return { user, workspace }
}

export function toPublicUser(user: MockUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
  }
}

export async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(`insightflow-mock:${password}`)
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
}
