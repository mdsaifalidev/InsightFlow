import { addDays, format, parseISO } from "date-fns"
import { parseAsJson, parseAsString, parseAsStringLiteral } from "nuqs"
import { z } from "zod"

import type { Filters } from "@/lib/api/types"

export const RANGE_PRESETS = [
  "all",
  "7d",
  "30d",
  "90d",
  "ytd",
  "custom",
] as const
export type RangePreset = (typeof RANGE_PRESETS)[number]

export const PRESET_LABELS: Record<RangePreset, string> = {
  all: "All time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  ytd: "Year to date",
  custom: "Custom range",
}

export const MAX_CATEGORY_FILTERS = 5

const whereSchema = z
  .array(
    z.object({ column: z.string().min(1), values: z.array(z.string()).min(1) })
  )
  .max(MAX_CATEGORY_FILTERS)

export type WhereFilter = z.infer<typeof whereSchema>[number]

/** URL state for the dashboard and table (shared across both tabs). */
export const filterParams = {
  range: parseAsStringLiteral(RANGE_PRESETS).withDefault("all"),
  from: parseAsString,
  to: parseAsString,
  where: parseAsJson(
    (value) => whereSchema.safeParse(value).data ?? null
  ).withDefault([]),
}

/** Query-string keys that carry filters (preserved when switching tabs). */
export const FILTER_KEYS = Object.keys(filterParams)

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const day = (date: Date) => format(date, "yyyy-MM-dd")

/**
 * Resolves a preset against the dataset's latest date, not today: exports
 * are often historical, and "last 30 days" should mean the data's last 30.
 */
export function resolveDateRange(
  preset: RangePreset,
  from: string | null,
  to: string | null,
  latest: string | null
): { from: string; to: string } | undefined {
  if (preset === "custom") {
    if (from && to && ISO_DAY.test(from) && ISO_DAY.test(to)) {
      return from <= to ? { from, to } : { from: to, to: from }
    }
    return undefined
  }
  if (preset === "all" || !latest) return undefined
  const end = parseISO(latest.slice(0, 10))
  if (preset === "ytd")
    return { from: `${latest.slice(0, 4)}-01-01`, to: day(end) }
  const days = { "7d": 7, "30d": 30, "90d": 90 }[preset]
  return { from: day(addDays(end, -(days - 1))), to: day(end) }
}

export function toApiFilters(
  dateColumn: string | null,
  range: { from: string; to: string } | undefined,
  where: WhereFilter[]
): Filters {
  return {
    dateRange:
      dateColumn && range ? { column: dateColumn, ...range } : undefined,
    where: where.map((w) => ({
      column: w.column,
      op: "in" as const,
      values: w.values,
    })),
  }
}
