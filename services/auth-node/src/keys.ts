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

const pem = (value: string) => {
  let s = value.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1)
  }
  return s.replace(/\\\\n/g, "\n").replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim()
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
  let pair: { privateKey: string; publicKey: string }
  if (config.JWT_PRIVATE_KEY && config.JWT_PUBLIC_KEY) {
    pair = { privateKey: pem(config.JWT_PRIVATE_KEY), publicKey: pem(config.JWT_PUBLIC_KEY) }
  } else if (config.NODE_ENV === "production") {
    throw new Error("JWT_PRIVATE_KEY and JWT_PUBLIC_KEY are required in production.")
  } else {
    pair = await readOrCreateDevKeys(path.resolve(config.KEYS_DIR), warn)
  }

  const privateKey = await importPKCS8(pair.privateKey, ALG)
  const current = await publicJwk(await importSPKI(pair.publicKey, ALG, { extractable: true }), config.JWT_KEY_ID)
  const keys: JWK[] = [current]
  if (config.JWT_PREVIOUS_PUBLIC_KEY) {
    const previous = await importSPKI(pem(config.JWT_PREVIOUS_PUBLIC_KEY), ALG, { extractable: true })
    keys.push(await publicJwk(previous, config.JWT_PREVIOUS_KEY_ID))
  }
  return { kid: current.kid, privateKey, jwks: { keys } }
}
