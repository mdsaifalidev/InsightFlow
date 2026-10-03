// Filtering, sorting, paging and widget aggregation over typed rows. Mirrors
// what the Python service will run with Polars (ARCHITECTURE §3.3).

import type {
  Aggregation,
  Filters,
  SeriesPoint,
  WidgetResult,
  WidgetSpec,
} from "@/lib/api/types"

import type { CellValue, Row } from "../types"
import { valueFormat } from "./measures"
import { bucket } from "./time"

export const OTHER = "Other"
const SINGLE_SERIES = "value"

function round(value: number, digits = 2) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export function applyFilters(rows: Row[], filters: Filters | undefined): Row[] {
  if (!filters) return rows
  const { dateRange, where = [] } = filters
  const sets = where
    .filter((w) => w.values.length)
    .map((w) => ({ column: w.column, values: new Set(w.values) }))
  if (!dateRange?.from && !dateRange?.to && !sets.length) return rows

  return rows.filter((row) => {
    if (dateRange && (dateRange.from || dateRange.to)) {
      const value = row[dateRange.column]
      if (typeof value !== "string") return false
      const day = value.slice(0, 10)
      if (dateRange.from && day < dateRange.from) return false
      if (dateRange.to && day > dateRange.to) return false
    }
    for (const { column, values } of sets) {
      const value = row[column]
      if (value === null || value === undefined || !values.has(String(value)))
        return false
    }
    return true
  })
}

function compare(a: CellValue, b: CellValue) {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === "number" && typeof b === "number") return a - b
  return String(a).localeCompare(String(b))
}

export function sortRows(
  rows: Row[],
  column: string,
  direction: "asc" | "desc"
) {
  const sign = direction === "asc" ? 1 : -1
  return [...rows].sort((ra, rb) => {
    const a = ra[column] ?? null
    const b = rb[column] ?? null
    // Nulls stay last in both directions.
    if (a === null || b === null) return compare(a, b)
    return compare(a, b) * sign
  })
}

export function aggregate(
  rows: Row[],
  column: string | undefined,
  aggregation: Aggregation
): number {
  if (aggregation === "count") return rows.length
  if (!column) return rows.length
  if (aggregation === "count_distinct") {
    return new Set(rows.map((r) => r[column]).filter((v) => v !== null)).size
  }
  const values: number[] = []
  for (const row of rows) {
    const v = row[column]
    if (typeof v === "number") values.push(v)
    else if (typeof v === "boolean") values.push(v ? 1 : 0)
  }
  if (!values.length) return 0
  switch (aggregation) {
    case "sum":
      return round(values.reduce((s, v) => s + v, 0))
    case "avg":
      return round(values.reduce((s, v) => s + v, 0) / values.length, 4)
    case "min":
      return Math.min(...values)
    case "max":
      return Math.max(...values)
  }
}

/** Groups rows by a key; null keys are dropped. */
function groupBy(rows: Row[], key: (row: Row) => string | null) {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const k = key(row)
    if (k === null) continue
    const list = groups.get(k)
    if (list) list.push(row)
    else groups.set(k, [row])
  }
  return groups
}

function categoryKey(column: string) {
  return (row: Row) => {
    const v = row[column]
    if (v === null || v === undefined) return null
    if (typeof v === "boolean") return v ? "Yes" : "No"
    return String(v)
  }
}

/** Keeps the top `limit` groups by size and folds the rest into "Other". */
function topGroups(
  groups: Map<string, Row[]>,
  limit: number,
  rank: (rows: Row[]) => number
) {
  const ranked = [...groups.entries()].sort((a, b) => rank(b[1]) - rank(a[1]))
  if (ranked.length <= limit) return ranked
  const kept = ranked.slice(0, limit - 1)
  const rest = ranked.slice(limit - 1).flatMap(([, rows]) => rows)
  return [...kept, [OTHER, rest] as [string, Row[]]]
}

function seriesSplit(rows: Row[], spec: WidgetSpec, limit: number) {
  if (!spec.split) return [[SINGLE_SERIES, rows]] as [string, Row[]][]
  const groups = groupBy(rows, categoryKey(spec.split))
  return topGroups(groups, limit, (g) => aggregate(g, spec.y, spec.aggregation))
}

function timeSeries(rows: Row[], spec: WidgetSpec): SeriesPoint[] {
  const grain = spec.timeGrain ?? "day"
  const splits = seriesSplit(rows, spec, 5)
  const byBucket = new Map<string, SeriesPoint>()
  for (const [name, seriesRows] of splits) {
    const buckets = groupBy(seriesRows, (row) => {
      const v = row[spec.x]
      return typeof v === "string" ? bucket(v, grain) : null
    })
    for (const [key, bucketRows] of buckets) {
      const point = byBucket.get(key) ?? { x: key }
      point[name] = aggregate(bucketRows, spec.y, spec.aggregation)
      byBucket.set(key, point)
    }
  }
  const names = splits.map(([name]) => name)
  const zeroFill = spec.aggregation === "sum" || spec.aggregation === "count"
  return [...byBucket.values()]
    .sort((a, b) => String(a.x).localeCompare(String(b.x)))
    .map((point) => {
      if (zeroFill) for (const name of names) point[name] ??= 0
      return point
    })
}

function categorySeries(rows: Row[], spec: WidgetSpec) {
  const limit = spec.limit ?? (spec.chartType === "donut" ? 6 : 8)
  const groups = groupBy(rows, categoryKey(spec.x))
  const top = topGroups(groups, limit, (g) =>
    aggregate(g, spec.y, spec.aggregation)
  )
  const splitNames = spec.split
    ? topGroups(groupBy(rows, categoryKey(spec.split)), 5, (g) => g.length).map(
        ([n]) => n
      )
    : [SINGLE_SERIES]

  return {
    series: splitNames,
    points: top.map(([category, groupRows]) => {
      const point: SeriesPoint = { x: category }
      if (!spec.split) {
        point[SINGLE_SERIES] = aggregate(groupRows, spec.y, spec.aggregation)
      } else {
        const inner = groupBy(groupRows, categoryKey(spec.split))
        for (const name of splitNames) {
          const splitRows =
            name === OTHER
              ? [...inner.entries()]
                  .filter(([k]) => !splitNames.includes(k))
                  .flatMap(([, r]) => r)
              : (inner.get(name) ?? [])
          point[name] = aggregate(splitRows, spec.y, spec.aggregation)
        }
      }
      return point
    }),
  }
}

function histogram(rows: Row[], column: string) {
  const values = rows
    .map((r) => r[column])
    .filter((v): v is number => typeof v === "number")
  if (!values.length) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const integers = values.every(Number.isInteger)
  const binCount = integers && max - min < 20 ? Math.max(1, max - min + 1) : 20
  const width = integers && max - min < 20 ? 1 : (max - min || 1) / binCount
  const counts = new Array<number>(binCount).fill(0)
  for (const v of values) {
    counts[Math.min(binCount - 1, Math.floor((v - min) / width))]! += 1
  }
  return counts.map((count, i) => ({
    x: round(min + i * width),
    x2: round(min + (i + 1) * width),
    [SINGLE_SERIES]: count,
  }))
}

export function runWidget(
  widgetId: string,
  rows: Row[],
  spec: WidgetSpec
): WidgetResult {
  const format = valueFormat(spec.y ?? "", spec.aggregation)
  switch (spec.chartType) {
    case "line":
    case "area": {
      const points = timeSeries(rows, spec)
      const series = spec.split
        ? [
            ...new Set(
              points.flatMap((p) => Object.keys(p).filter((k) => k !== "x"))
            ),
          ]
        : [SINGLE_SERIES]
      return { widgetId, series, points, format }
    }
    case "bar":
    case "donut":
      return { widgetId, ...categorySeries(rows, spec), format }
    case "histogram":
      return {
        widgetId,
        series: [SINGLE_SERIES],
        points: histogram(rows, spec.x),
        format: "number",
        xFormat: valueFormat(spec.x, "sum"),
      }
  }
}
