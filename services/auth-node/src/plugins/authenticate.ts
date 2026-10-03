import type { FastifyRequest } from "fastify"

import type { Config } from "../config.js"
import { HttpProblem } from "../errors.js"
import type { SigningKeys } from "../keys.js"
import { verifyAccessToken, type AccessClaims } from "../tokens.js"

declare module "fastify" {
  interface FastifyRequest {
    auth?: AccessClaims
  }
}

/** preHandler that requires a valid bearer access token. */
export function requireAuth(keys: SigningKeys, config: Config) {
  return async (request: FastifyRequest) => {
    const header = request.headers.authorization
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null
    if (!token) throw new HttpProblem(401, "Unauthorized", "Sign in to continue.")
    try {
      request.auth = await verifyAccessToken(keys, config, token)
    } catch {
      throw new HttpProblem(401, "Unauthorized", "Your session has expired. Sign in again.")
    }
  }
}
