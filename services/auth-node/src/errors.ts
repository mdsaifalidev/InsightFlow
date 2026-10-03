// RFC 7807 problem responses, shaped exactly like the web's mock contract:
// validation failures are 422 with a field → message `errors` map.

import type { FastifyError, FastifyReply, FastifyRequest } from "fastify"
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod"
import { z } from "zod"

/** RFC 7807 body, declared on every route so the OpenAPI spec describes errors. */
export const problemSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  /** Field-level messages, keyed by request field. */
  errors: z.record(z.string(), z.string()).optional(),
  instance: z.string().optional(),
})

/** `response` entries for the problem codes a route can answer with. */
z.globalRegistry.add(problemSchema, { id: "Problem" })

export function problems(...codes: number[]) {
  return Object.fromEntries(codes.map((code) => [code, problemSchema])) as Record<
    number,
    typeof problemSchema
  >
}

export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string,
    readonly errors?: Record<string, string>
  ) {
    super(detail ?? title)
    this.name = "HttpProblem"
  }
}

export function sendProblem(
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
  errors?: Record<string, string>
) {
  return reply
    .code(status)
    .type("application/problem+json")
    .send({ type: "about:blank", title, status, detail, errors, instance: reply.request.url })
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof HttpProblem) {
    return sendProblem(reply, error.status, error.title, error.detail, error.errors)
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    const errors: Record<string, string> = {}
    for (const issue of error.validation) {
      const field = issue.instancePath.replace(/^\//, "").split("/")[0] || "body"
      errors[field] ??= issue.message ?? "Invalid value."
    }
    return sendProblem(reply, 422, "Validation failed", "Check the highlighted fields.", errors)
  }
  if (error.statusCode === 429) {
    return sendProblem(reply, 429, "Too many attempts", "Too many attempts. Wait a minute and try again.")
  }
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    return sendProblem(reply, error.statusCode, error.name || "Bad request", error.message)
  }
  request.log.error({ err: error }, "Unhandled error")
  return sendProblem(reply, 500, "Internal Server Error", "Something went wrong on our side.")
}
