import type { FastifyInstance } from "fastify"
import type { Redis } from "ioredis"
import type { Sql } from "postgres"

import { z } from "zod"

import type { SigningKeys } from "../keys.js"

export async function metaRoutes(
  app: FastifyInstance,
  { keys, sql, redis }: { keys: SigningKeys; sql: Sql; redis?: Redis }
) {
  // Public keys for verifying access tokens (the data service caches these).
  app.get(
    "/api/auth/.well-known/jwks.json",
    {
      schema: {
        operationId: "jwks",
        tags: ["meta"],
        summary: "JSON Web Key Set",
        response: {
          200: z.object({
            keys: z.array(z.looseObject({ kid: z.string(), alg: z.string(), use: z.string() })),
          }),
        },
      },
    },
    async (_request, reply) => {
      reply.header("Cache-Control", "public, max-age=300")
      return keys.jwks
    }
  )

  app.get("/api/auth/openapi.json", { schema: { hide: true } }, async () => app.swagger())

  // Liveness and readiness for Docker / orchestrators (not routed by nginx).
  app.get("/health", { schema: { hide: true }, logLevel: "silent" }, async () => ({ status: "ok" }))
  app.get("/ready", { schema: { hide: true }, logLevel: "silent" }, async (_request, reply) => {
    try {
      // Redis backs the rate limiter and the user.deleted publisher, so a
      // healthy instance needs both.
      await Promise.all([sql`select 1`, redis?.ping()])
      return { status: "ok" }
    } catch {
      return reply.code(503).send({ status: "unavailable" })
    }
  })
}
