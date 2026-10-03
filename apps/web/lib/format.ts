import { format, formatDistanceToNowStrict, parseISO } from "date-fns"

const numberFmt = new Intl.NumberFormat("en-US")
const compactFmt = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})
const decimalFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 })

export function formatNumber(
  value: number | null | undefined,
  opts?: { compact?: boolean }
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  if (opts?.compact && Math.abs(value) >= 10_000)
    return compactFmt.format(value)
  return Number.isInteger(value)
    ? numberFmt.format(value)
    : decimalFmt.format(value)
}

/** 0.184 → "18.4%". */
export function formatPercent(fraction: number, digits = 1) {
  return `${(fraction * 100).toFixed(digits).replace(/\.0+$/, "")}%`
}

/** Signed change for deltas: -0.184 → "−18.4%" (true minus sign). */
export function formatDelta(fraction: number, digits = 1) {
  const text = formatPercent(Math.abs(fraction), digits)
  if (fraction > 0) return `+${text}`
  if (fraction < 0) return `−${text}`
  return text
}

const currencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})
const compactCurrencyFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
})

/** Formats a value by its semantic format (see ValueFormat in lib/api/types). */
export function formatValue(
  value: number | null | undefined,
  format: "number" | "currency" | "percent" | "duration_ms" | "change",
  opts?: { compact?: boolean }
) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  switch (format) {
    case "currency":
      return opts?.compact
        ? compactCurrencyFmt.format(value)
        : currencyFmt.format(value)
    case "percent":
      return `${decimalFmt.format(Math.round(value * 10) / 10)}%`
    case "duration_ms":
      return value >= 10_000
        ? `${decimalFmt.format(Math.round(value / 100) / 10)} s`
        : `${formatNumber(Math.round(value))} ms`
    case "change":
      return formatDelta(value)
    default:
      return formatNumber(
        Math.abs(value) < 100
          ? Math.round(value * 100) / 100
          : Math.round(value),
        opts
      )
  }
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export function formatRelative(iso: string) {
  const date = parseISO(iso)
  if (Date.now() - date.getTime() < 60_000) return "just now"
  return `${formatDistanceToNowStrict(date)} ago`
}

/**
 * Time-bucket keys from the query API ("2025-04-01", "2025-09-18T14:00").
 * "tick" is short for axes; "full" is for tooltips.
 */
export function formatBucket(
  key: string,
  grain: "hour" | "day" | "week" | "month",
  style: "tick" | "full" = "tick"
) {
  const date = parseISO(key.length === 16 ? `${key}:00Z` : key)
  if (Number.isNaN(date.getTime())) return key
  switch (grain) {
    case "month":
      return format(date, style === "tick" ? "MMM" : "MMMM yyyy")
    case "week":
      return style === "tick"
        ? format(date, "MMM d")
        : `Week of ${format(date, "MMM d, yyyy")}`
    case "day":
      return format(date, style === "tick" ? "MMM d" : "EEE, MMM d, yyyy")
    case "hour": {
      // Keys are UTC; show them as such so they match the data.
      const time = key.slice(11, 16)
      return style === "tick"
        ? time
        : `${format(parseISO(key.slice(0, 10)), "MMM d")}, ${time} UTC`
    }
  }
}

/** Dates as "Apr 3, 2025"; timestamps add the time. */
export function formatDate(iso: string) {
  const date = parseISO(iso)
  return iso.length <= 10
    ? format(date, "MMM d, yyyy")
    : format(date, "MMM d, yyyy HH:mm")
}
