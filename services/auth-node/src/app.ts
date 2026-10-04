import { randomUUID } from "node:crypto"

import cookie from "@fastify/cookie"
import cors from "@fastify/cors"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import Fastify from "fastify"
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod"
import { Redis } from "ioredis"
import type { Sql } from "postgres"

import type { Config } from "./config.js"
import type { Database } from "./db/client.js"
import { errorHandler, sendProblem } from "./errors.js"
import type { EventPublisher } from "./events.js"
import type { SigningKeys } from "./keys.js"
import { authRoutes } from "./routes/auth.js"
import { metaRoutes } from "./routes/meta.js"

export type AppDeps = {
  config: Config
  db: Database
  sql: Sql
  keys: SigningKeys
  events: EventPublisher
}

export async function buildApp(deps: AppDeps) {
  const { config } = deps
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            level: config.LOG_LEVEL,
            transport:
              config.NODE_ENV === "development"
                ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } }
                : undefined,
          },
    // Keep the gateway's X-Request-ID so logs line up across services.
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
    trustProxy: true,
  })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((request, reply) =>
    sendProblem(reply, 404, "Not found", `No route for ${request.method} ${request.url}`)
  )
  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Request-ID", request.id)
  })

  await app.register(cookie)
  await app.register(cors, {
    origin: [
      config.WEB_ORIGIN,
      "https://useinsightflow.vercel.app",
      "https://insight-flow-bice-seven.vercel.app",
      "http://localhost:3000",
      /\.vercel\.app$/,
    ],
    credentials: true,
  })
  const rateLimitRedis = config.REDIS_URL ? new Redis(config.REDIS_URL, { maxRetriesPerRequest: 1 }) : undefined
  await app.register(rateLimit, {
    global: false,
    // After body parsing, so the login limit can key on the email.
    hook: "preHandler",
    redis: rateLimitRedis,
    nameSpace: "auth-rate-limit:",
  })
  if (rateLimitRedis) app.addHook("onClose", async () => void (await rateLimitRedis.quit()))

  await app.register(swagger, {
    openapi: {
      info: {
        title: "InsightFlow Auth API",
        description: "Users, workspaces, sessions and JWT issuing (docs/PRD.md §9).",
        version: "0.1.0",
      },
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  })

  await app.register(async (scope) => authRoutes(scope, deps), { prefix: "/api/auth" })
  await app.register(async (scope) => metaRoutes(scope, { ...deps, redis: rateLimitRedis }))

  return app
}
