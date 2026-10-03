// RS256 signing keys (ADR-007). Production supplies PEMs via env; development
// generates a pair once and keeps it in KEYS_DIR so sessions survive restarts.

import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  calculateJwkThumbprint,
  exportJWK,
  exportPKCS8,
  exportSPKI,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  type CryptoKey,
  type JWK,
} from "jose"

import type { Config } from "./config.js"

export const ALG = "RS256"

export type SigningKeys = {
  kid: string
  privateKey: CryptoKey
  /** Public JWKS: the current key plus an optional previous one. */
  jwks: { keys: JWK[] }
}

const normalizePem = (value: string, type: "PRIVATE" | "PUBLIC") => {
  if (!value) return ""
  let s = value.replace(/^["']|["']$/g, "")
  s = s.replace(/^.*?(?=-----BEGIN)/s, "")
  s = s.replace(/-----BEGIN\s+[A-Z\s]+KEY-----/i, "")
       .replace(/-----END\s+[A-Z\s]+KEY-----/i, "")
  s = s.replace(/[^A-Za-z0-9+/=]/g, "")
  const lines = s.match(/.{1,64}/g)?.join("\n") ?? ""
  return `-----BEGIN ${type} KEY-----\n${lines}\n-----END ${type} KEY-----`
}

async function publicJwk(publicKey: CryptoKey, kid?: string) {
  const jwk = await exportJWK(publicKey)
  const id = kid ?? (await calculateJwkThumbprint(jwk))
  return { ...jwk, kid: id, alg: ALG, use: "sig" } satisfies JWK
}

export async function generatePemPair() {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { modulusLength: 2048, extractable: true })
  return { privateKey: await exportPKCS8(privateKey), publicKey: await exportSPKI(publicKey) }
}

async function readOrCreateDevKeys(dir: string, warn: (msg: string) => void) {
  const privatePath = path.join(dir, "private.pem")
  const publicPath = path.join(dir, "public.pem")
  try {
    return {
      privateKey: await readFile(privatePath, "utf8"),
      publicKey: await readFile(publicPath, "utf8"),
    }
  } catch {
    const pair = await generatePemPair()
    await mkdir(dir, { recursive: true })
    await writeFile(privatePath, pair.privateKey, { mode: 0o600 })
    await writeFile(publicPath, pair.publicKey)
    warn(`Generated a development signing key pair in ${dir}`)
    return pair
  }
}

export async function loadKeys(config: Config, warn: (msg: string) => void = console.warn): Promise<SigningKeys> {
  let pair: { privateKey: string; publicKey: string } | null = null
  if (config.JWT_PRIVATE_KEY && config.JWT_PUBLIC_KEY) {
    try {
      const priv = normalizePem(config.JWT_PRIVATE_KEY, "PRIVATE")
      const pub = normalizePem(config.JWT_PUBLIC_KEY, "PUBLIC")
      await importPKCS8(priv, ALG)
      await importSPKI(pub, ALG)
      pair = { privateKey: priv, publicKey: pub }
    } catch (err) {
      warn(`Provided JWT keys could not be parsed: ${(err as Error).message}. Generating an automated key pair.`)
    }
  }

  if (!pair) {
    if (config.NODE_ENV !== "production") {
      pair = await readOrCreateDevKeys(path.resolve(config.KEYS_DIR), warn)
    } else {
      pair = await generatePemPair()
      warn(`Generated automated signing key pair (kid: ${config.JWT_KEY_ID || "auto"}).`)
    }
  }

  const privateKey = await importPKCS8(pair.privateKey, ALG)
  const current = await publicJwk(await importSPKI(pair.publicKey, ALG, { extractable: true }), config.JWT_KEY_ID)
  const keys: JWK[] = [current]
  if (config.JWT_PREVIOUS_PUBLIC_KEY) {
    try {
      const previous = await importSPKI(normalizePem(config.JWT_PREVIOUS_PUBLIC_KEY, "PUBLIC"), ALG, { extractable: true })
      keys.push(await publicJwk(previous, config.JWT_PREVIOUS_KEY_ID))
    } catch {
      // Ignore invalid retired keys
    }
  }
  return { kid: current.kid, privateKey, jwks: { keys } }
}
