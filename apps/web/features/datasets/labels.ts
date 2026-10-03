const ACRONYMS = new Set([
  "mrr",
  "arr",
  "gmv",
  "sku",
  "url",
  "id",
  "ip",
  "roi",
  "ltv",
  "cac",
])

/** Display name for a column: "net_revenue" → "Net revenue", "mrr" → "MRR". */
export function humanizeColumn(name: string) {
  const text = name
    .split("_")
    .filter(Boolean)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()
    )
    .join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}
