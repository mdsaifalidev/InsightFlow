// UTC time bucketing shared by widgets, KPIs and the facts engine.

import type { TimeGrain } from "@/lib/api/types"

import { toTimestamp } from "./values"

export const DAY_MS = 86_400_000
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

/** Bucket key for an ISO date/timestamp: "2025-04-01", "2025-09-18T14:00". */
export function bucket(iso: string, grain: TimeGrain): string {
  switch (grain) {
    case "hour":
      return iso.length > 10 ? `${iso.slice(0, 13)}:00` : `${iso}T00:00`
    case "day":
      return iso.slice(0, 10)
    case "month":
      return `${iso.slice(0, 7)}-01`
    case "week": {
      // ISO weeks start on Monday.
      const date = new Date(toTimestamp(iso.slice(0, 10)))
      const offset = (date.getUTCDay() + 6) % 7
      return new Date(date.getTime() - offset * DAY_MS)
        .toISOString()
        .slice(0, 10)
    }
  }
}

export function dayIndex(iso: string) {
  return Math.floor(toTimestamp(iso.slice(0, 10)) / DAY_MS)
}

export function isoFromDayIndex(index: number) {
  return new Date(index * DAY_MS).toISOString().slice(0, 10)
}

/** Human label for a bucket key, used in narratives ("April 2025", "Sep 18"). */
export function periodLabel(key: string, grain: TimeGrain) {
  const [year, month, day] = [
    key.slice(0, 4),
    Number(key.slice(5, 7)),
    Number(key.slice(8, 10)),
  ]
  switch (grain) {
    case "month":
      return `${MONTHS_LONG[month - 1]} ${year}`
    case "week":
      return `the week of ${MONTHS[month - 1]} ${day}`
    case "day":
      return `${MONTHS[month - 1]} ${day}`
    case "hour":
      return `${key.slice(11, 16)} on ${MONTHS[month - 1]} ${day}`
  }
}

/** Period with its preposition: "in April 2025", "on Sep 18", "at 14:00 on Sep 18". */
export function inPeriod(key: string, grain: TimeGrain) {
  const label = periodLabel(key, grain)
  switch (grain) {
    case "month":
    case "week":
      return `in ${label}`
    case "day":
      return `on ${label}`
    case "hour":
      return `at ${label}`
  }
}

/** Grain for period-over-period storytelling, based on the data's span. */
export function storyGrain(
  minIso: string,
  maxIso: string,
  profiled: TimeGrain
): TimeGrain {
  if (profiled === "month") return "month"
  const span = toTimestamp(maxIso) - toTimestamp(minIso)
  if (span > 120 * DAY_MS) return "month"
  if (span > 3 * DAY_MS) return "day"
  return "hour"
}

/** Finer grain for spotting anomalies within the story grain. */
export function anomalyGrain(
  story: TimeGrain,
  minIso: string,
  maxIso: string
): TimeGrain {
  if (story === "month") {
    // Daily detail only when the data really is daily (not monthly snapshots).
    return toTimestamp(maxIso) - toTimestamp(minIso) > 400 * DAY_MS
      ? "month"
      : "day"
  }
  if (story === "day") return "hour"
  return "hour"
}
