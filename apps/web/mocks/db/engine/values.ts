// Value recognizers shared by parsing (coercion) and profiling (inference).

import type { CellValue } from "../types"

const NUMBER_RE = /^[-+]?[$€£]?\s?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const BOOL_VALUES: Record<string, boolean> = {
  true: true,
  false: false,
  yes: true,
  no: false,
}

export function isBlank(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  )
}

export function toNumber(value: CellValue): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!NUMBER_RE.test(trimmed)) return null
  const n = Number(trimmed.replace(/[$€£,%\s+]/g, ""))
  return Number.isFinite(n) ? n : null
}

/** Returns an ISO string: "YYYY-MM-DD" for dates, full ISO for timestamps. */
export function toIsoDate(value: CellValue | Date): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const iso = value.toISOString()
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso
  }
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (ISO_DATE_RE.test(trimmed)) {
    if (trimmed.length === 10) return trimmed
    const date = new Date(
      trimmed.includes("T") ? trimmed : trimmed.replace(" ", "T")
    )
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  const us = US_DATE_RE.exec(trimmed)
  if (us) {
    const [, month, day, year] = us
    const date = new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day))
    )
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  return null
}

export function toBoolean(value: CellValue): boolean | null {
  if (typeof value === "boolean") return value
  if (typeof value !== "string") return null
  const v = BOOL_VALUES[value.trim().toLowerCase()]
  return v === undefined ? null : v
}

export function toText(value: CellValue | Date): string | null {
  if (isBlank(value)) return null
  if (value instanceof Date) return toIsoDate(value)
  return String(value).trim()
}

export function toTimestamp(iso: string) {
  return iso.length === 10 ? Date.parse(`${iso}T00:00:00Z`) : Date.parse(iso)
}
