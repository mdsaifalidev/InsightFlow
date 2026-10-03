// Stand-in for the LLM (ADR-010). The real service sends facts to Claude and
// validates its output; here templates produce the same shape. Numbers only
// appear as {{factId}} tokens, and validateNarrative enforces that.

import type { Fact } from "@/lib/api/types"

const MONTH = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*"
// Order matters: "April 2025" must match before "Apr 20" can eat "20".
const ALLOWED_NUMBER_PATTERNS = [
  /\{\{\w+\}\}/g, // fact references
  new RegExp(`\\b${MONTH}\\s+\\d{4}\\b`, "g"), // "April 2025"
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(,\\s*\\d{4})?\\b`, "g"), // "Sep 18", "April 3, 2025"
  /\b\d{4}-\d{2}-\d{2}\b/g, // ISO dates
  /\b\d{1,2}:\d{2}\b/g, // times
  /\b(19|20)\d{2}\b/g, // years
]

/**
 * Returns the ungrounded numbers in a narrative: any digit left after removing
 * fact references and date/time expressions. Empty means the text is valid.
 */
export function ungroundedNumbers(text: string, facts: Fact[]): string[] {
  const known = new Set(facts.map((f) => f.id))
  const refs = [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!)
  const unknownRefs = refs
    .filter((ref) => !known.has(ref))
    .map((ref) => `{{${ref}}}`)
  let rest = text
  for (const pattern of ALLOWED_NUMBER_PATTERNS)
    rest = rest.replace(pattern, " ")
  const numbers = rest.match(/[-+−]?\$?\d[\d,.]*\s?%?/g) ?? []
  return [...unknownRefs, ...numbers.map((n) => n.trim())]
}

export function validateNarrative(text: string, facts: Fact[]) {
  return ungroundedNumbers(text, facts).length === 0
}

/** Drops any sentence that fails validation (the real service regenerates). */
export function keepGrounded(sentences: string[], facts: Fact[]) {
  return sentences.filter((s) => validateNarrative(s, facts))
}
