// Access tokens (RS256 JWT) and rotating refresh tokens (ADR-007).

import { createHash, randomBytes, randomUUID } from "node:crypto"

import { and, eq, isNull, ne } from "drizzle-orm"
import { createLocalJWKSet, jwtVerify, SignJWT } from "jose"

import type { Config } from "./config.js"
import type { Database } from "./db/client.js"
import { refreshTokens } from "./db/schema.js"
import { ALG, type SigningKeys } from "./keys.js"

export type AccessClaims = { sub: string; wid: string }

export function signAccessToken(keys: SigningKeys, config: Config, claims: AccessClaims) {
  return new SignJWT({ wid: claims.wid })
    .setProtectedHeader({ alg: ALG, kid: keys.kid, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${config.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(keys.privateKey)
}

export async function verifyAccessToken(keys: SigningKeys, config: Config, token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, createLocalJWKSet(keys.jwks), {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    algorithms: [ALG],
  })
  if (!payload.sub || typeof payload.wid !== "string") throw new Error("Token is missing claims")
  return { sub: payload.sub, wid: payload.wid }
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex")

type Client = { ip?: string; userAgent?: string }

/** Issues a refresh token; a new login starts a new family. */
export async function issueRefreshToken(
  db: Database,
  config: Config,
  userId: string,
  client: Client,
  familyId: string = randomUUID()
) {
  const token = randomBytes(32).toString("base64url")
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip: client.ip,
      userAgent: client.userAgent,
    })
    .returning({ id: refreshTokens.id })
  return { token, id: row!.id, familyId }
}

export type RotationResult =
  | { status: "ok"; userId: string; token: string; familyId: string }
  | { status: "reuse"; userId: string; familyId: string }
  | { status: "invalid" }

/**
 * Exchanges a refresh token for a new one. Presenting a token that was
 * already rotated or revoked means it leaked: the whole family is revoked.
 */
export async function rotateRefreshToken(
  db: Database,
  config: Config,
  token: string,
  client: Client
): Promise<RotationResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hashToken(token)))
      .for("update")
    if (!row) return { status: "invalid" as const }

    if (row.revokedAt || row.replacedBy) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)))
      return { status: "reuse" as const, userId: row.userId, familyId: row.familyId }
    }
    if (row.expiresAt.getTime() <= Date.now()) return { status: "invalid" as const }

    const next = await issueRefreshToken(tx as unknown as Database, config, row.userId, client, row.familyId)
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date(), replacedBy: next.id })
      .where(eq(refreshTokens.id, row.id))
    return { status: "ok" as const, userId: row.userId, token: next.token, familyId: row.familyId }
  })
}

/** The family a refresh token belongs to, if it exists. */
export async function familyOf(db: Database, token: string) {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId, userId: refreshTokens.userId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)))
  return row ?? null
}

export async function revokeFamily(db: Database, familyId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)))
}

/** Signs out every other session (e.g. after a password change). */
export async function revokeOtherFamilies(db: Database, userId: string, keepFamilyId: string | null) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt),
        keepFamilyId ? ne(refreshTokens.familyId, keepFamilyId) : undefined
      )
    )
}
