// Column type inference and profiling (PRD F4). A TypeScript mirror of what the
// Python service will do with Polars, so the UI can be built against real
// shapes and edge cases.

import type { ColumnProfile, ColumnType, TimeGrain } from "@/lib/api/types"

import type { CellValue, Row } from "../types"
import {
  isBlank,
  toBoolean,
  toIsoDate,
  toNumber,
  toText,
  toTimestamp,
} from "./values"

const ID_NAME_RE = /(^id$|_id$|^id_|uuid|guid)/i
const CODE_NAME_RE = /(status|code|level|rating|tier)/i
const DAY_MS = 86_400_000

function share(values: CellValue[], test: (v: CellValue) => boolean) {
  if (!values.length) return 0
  let hits = 0
  for (const v of values) if (test(v)) hits++
  return hits / values.length
}

export function inferType(name: string, values: CellValue[]): ColumnType {
  const present = values.filter((v) => !isBlank(v))
  if (!present.length) return "text"

  if (ID_NAME_RE.test(name)) return "id"
  if (share(present, (v) => toBoolean(v) !== null) === 1) return "boolean"
  if (
    share(present, (v) => typeof v !== "number" && toIsoDate(v) !== null) >= 0.9
  ) {
    return "datetime"
  }

  const distinct = new Set(present.map((v) => String(v))).size
  if (share(present, (v) => toNumber(v) !== null) >= 0.95) {
    // Small sets of integer codes (HTTP status, ratings) read as categories.
    const integers = present.every((v) => Number.isInteger(toNumber(v)))
    return integers && distinct <= 12 && CODE_NAME_RE.test(name)
      ? "categorical"
      : "numeric"
  }

  const limit = Math.min(200, Math.max(50, present.length * 0.05))
  if (distinct <= limit) return "categorical"
  if (
    distinct === present.length &&
    present.every((v) => /^[A-Za-z]*[-_]?\d+$/.test(String(v)))
  ) {
    return "id"
  }
  return "text"
}

/** Converts raw values to the column's type; unparseable values become null. */
export function coerce(value: CellValue | Date, type: ColumnType): CellValue {
  if (isBlank(value as CellValue)) return null
  switch (type) {
    case "numeric":
      return toNumber(value as CellValue)
    case "datetime":
      return toIsoDate(value)
    case "boolean":
      return toBoolean(value as CellValue)
    default:
      return toText(value)
  }
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo)
}

function round(value: number, digits = 4) {
  const f = 10 ** digits
  return Math.round(value * f) / f
}

export function inferGrain(
  minIso: string,
  maxIso: string,
  allMonthStarts = false
): TimeGrain {
  // Monthly snapshots (every date on the 1st) read best by month.
  if (allMonthStarts) return "month"
  const span = toTimestamp(maxIso) - toTimestamp(minIso)
  if (span <= 3 * DAY_MS) return "hour"
  if (span <= 120 * DAY_MS) return "day"
  if (span <= 2 * 366 * DAY_MS) return "week"
  return "month"
}

function topValues(values: CellValue[], limit = 10) {
  const counts = new Map<string, number>()
  for (const v of values) {
    const key = String(v)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }))
}

/** Profiles already-coerced values of one column. */
export function profileColumn(
  values: CellValue[],
  type: ColumnType
): ColumnProfile {
  const present = values.filter((v) => v !== null)
  const profile: ColumnProfile = {
    nullPct: values.length
      ? round((values.length - present.length) / values.length)
      : 0,
    distinctCount: new Set(present.map((v) => String(v))).size,
  }

  if (type === "numeric") {
    const nums = present
      .filter((v): v is number => typeof v === "number")
      .sort((a, b) => a - b)
    if (nums.length) {
      const sum = nums.reduce((s, n) => s + n, 0)
      profile.numeric = {
        min: nums[0]!,
        max: nums[nums.length - 1]!,
        mean: round(sum / nums.length),
        median: round(quantile(nums, 0.5)),
        p95: round(quantile(nums, 0.95)),
        sum: round(sum, 2),
      }
    }
  } else if (type === "datetime") {
    const dates = present.map(String).sort()
    if (dates.length) {
      const min = dates[0]!
      const max = dates[dates.length - 1]!
      const monthStarts =
        dates.length > 1 &&
        min !== max &&
        dates.every(
          (d) =>
            d.slice(8, 10) === "01" &&
            /^\d{4}-\d{2}-01(T00:00:00(\.000)?Z)?$/.test(d)
        )
      profile.datetime = { min, max, grain: inferGrain(min, max, monthStarts) }
    }
  } else {
    profile.categorical = { top: topValues(present) }
  }
  return profile
}

export type ProfiledColumn = {
  name: string
  type: ColumnType
  profile: ColumnProfile
}

/** Infers, coerces in place and profiles every column of a table. */
export function profileTable(
  columnNames: string[],
  rows: Row[]
): ProfiledColumn[] {
  return columnNames.map((name) => {
    const raw = rows.map((row) => row[name] ?? null)
    const type = inferType(name, raw)
    const values = raw.map((v) => coerce(v, type))
    rows.forEach((row, i) => {
      row[name] = values[i]!
    })
    return { name, type, profile: profileColumn(values, type) }
  })
}

export function detectDateColumn(
  columns: { name: string; type: ColumnType }[]
) {
  return columns.find((c) => c.type === "datetime")?.name ?? null
}
