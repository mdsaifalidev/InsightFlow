import { z } from "zod"

// All configuration comes from the environment, validated once at startup.
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1),
  /** Optional: rate-limit store and event bus. Without it both run in-process. */
  REDIS_URL: z.string().optional(),

  /** Browser origin allowed to call this service with credentials (CORS). */
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  COOKIE_SECURE: z.stringbool().default(false),

  JWT_ISSUER: z.string().default("insightflow-auth"),
  JWT_AUDIENCE: z.string().default("insightflow"),
  /** PEM keys (\n may be escaped). Required in production; generated in dev. */
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),
  JWT_KEY_ID: z.string().optional(),
  /** A retired public key still accepted during rotation. */
  JWT_PREVIOUS_PUBLIC_KEY: z.string().optional(),
  JWT_PREVIOUS_KEY_ID: z.string().optional(),
  KEYS_DIR: z.string().default(".keys"),

  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  LOGIN_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(5),
})

export type Config = z.infer<typeof schema>

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env)
  if (!result.success) {
    throw new Error(`Invalid configuration:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}
