// Heuristics for which numeric columns matter and how to summarize them.

import type {
  Aggregation,
  ColumnType,
  DatasetColumn,
  Kpi,
} from "@/lib/api/types"

const PRIORITY = [
  /revenue|sales|gmv/,
  /mrr|arr|recurring/,
  /amount|total|net|value/,
  /profit|margin/,
  /latency|duration|response_time|_ms$/,
  /price|cost/,
  /seats|quantity|units|qty/,
]
const AVERAGED =
  /price|latency|duration|_ms$|rate|pct|percent|ratio|score|age|discount/
const FLAG_PRIORITY = /churn|cancel|error|fail|refund|return|bounce/

export function effectiveType(column: DatasetColumn): ColumnType {
  return column.overrideType ?? column.inferredType
}

export function columnsOfType(columns: DatasetColumn[], type: ColumnType) {
  return columns.filter((c) => effectiveType(c) === type)
}

/** Numeric columns ranked by how likely they are the "main" measure. */
export function rankedMeasures(columns: DatasetColumn[]) {
  const rank = (name: string) => {
    const i = PRIORITY.findIndex((re) => re.test(name))
    return i === -1 ? PRIORITY.length : i
  }
  return columnsOfType(columns, "numeric")
    .filter((c) => c.profile.distinctCount > 1)
    .sort((a, b) => rank(a.name) - rank(b.name) || a.position - b.position)
}

/** Boolean columns worth tracking over time (churned, is_error, ...). */
export function flagColumns(columns: DatasetColumn[]) {
  return columnsOfType(columns, "boolean")
    .filter((c) => FLAG_PRIORITY.test(c.name))
    .sort((a, b) => a.position - b.position)
}

export function defaultAggregation(name: string): Aggregation {
  return AVERAGED.test(name) ? "avg" : "sum"
}

export function valueFormat(
  name: string,
  aggregation: Aggregation
): Kpi["format"] {
  if (aggregation === "count" || aggregation === "count_distinct")
    return "number"
  if (/latency|duration|_ms$/.test(name)) return "duration_ms"
  if (/pct|percent/.test(name)) return "percent"
  if (/revenue|sales|gmv|mrr|arr|amount|price|cost|profit|total/.test(name))
    return "currency"
  return "number"
}

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

function words(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\bpct\b/, "%")
    .replace(/\bms\b/, "")
    .trim()
    .split(/\s+/)
    .map((w) =>
      ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.toLowerCase()
    )
}

/** "net_revenue" → "Net revenue", "mrr" → "MRR". */
export function humanize(name: string) {
  const text = words(name).join(" ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Mid-sentence form: "net revenue", "MRR". */
export function phrase(name: string) {
  return words(name).join(" ")
}

/** Noun for a boolean flag: "churned" → "Churn", "is_error" → "Error". */
export function flagNoun(name: string) {
  const known: [RegExp, string][] = [
    [/churn/, "Churn"],
    [/cancel/, "Cancellation"],
    [/error/, "Error"],
    [/fail/, "Failure"],
    [/refund/, "Refund"],
    [/return/, "Return"],
    [/bounce/, "Bounce"],
  ]
  return (
    known.find(([re]) => re.test(name))?.[1] ??
    humanize(name.replace(/^(is|has)_/, ""))
  )
}

const AGG_WORDS: Record<Aggregation, string> = {
  sum: "Total",
  avg: "Average",
  count: "Count of",
  count_distinct: "Distinct",
  min: "Minimum",
  max: "Maximum",
}

/** "Total revenue", "Average latency", "Rows". */
export function measureLabel(
  column: string | undefined,
  aggregation: Aggregation
) {
  if (!column || aggregation === "count") return "Rows"
  return `${AGG_WORDS[aggregation]} ${phrase(column)}`
}

/** "order_id" → "Orders". */
export function entityLabel(idColumn: string) {
  const base =
    idColumn
      .replace(/(_id|id_|^id)$/i, "")
      .replace(/_/g, " ")
      .trim() || "record"
  const plural = base.endsWith("s") ? base : `${base}s`
  return plural.charAt(0).toUpperCase() + plural.slice(1)
}
