// Prints a fresh RS256 key pair as single-line env values for production.
import { generatePemPair } from "../src/keys.js"

const { privateKey, publicKey } = await generatePemPair()
const oneLine = (pem: string) => pem.trim().replace(/\n/g, "\\n")
console.log(`JWT_PRIVATE_KEY="${oneLine(privateKey)}"`)
console.log(`JWT_PUBLIC_KEY="${oneLine(publicKey)}"`)
console.log(`JWT_KEY_ID="${new Date().toISOString().slice(0, 10)}"`)
