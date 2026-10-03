import { hash, verify } from "@node-rs/argon2"

// Argon2id with OWASP's baseline parameters (19 MiB, 2 iterations).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const

export function hashPassword(password: string) {
  return hash(password, OPTIONS)
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password)
  } catch {
    return false
  }
}

// Used when the email doesn't exist so login takes the same time either way.
let dummyHash: Promise<string> | null = null
export async function burnPasswordCheck(password: string) {
  dummyHash ??= hash("insightflow-timing-equalizer", OPTIONS)
  await verifyPassword(await dummyHash, password)
}
