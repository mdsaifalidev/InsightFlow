// KPI strip (PRD F5): headline numbers with a period-over-period delta.

import type { Aggregation, DatasetColumn, Filters, Kpi } from "@/lib/api/types"

import type { Row } from "../types"
import {
  columnsOfType,
  defaultAggregation,
  entityLabel,
  flagColumns,
  flagNoun,
  measureLabel,
  rankedMeasures,
  valueFormat,
} from "./measures"
import { aggregate, applyFilters } from "./query"
import { dayIndex } from "./time"

type KpiDef = {
  id: string
  label: string
  column: string | null
  aggregation: Aggregation
  format: Kpi["format"]
  /** Boolean share shown as percentage points. */
  scale?: number
}

function kpiDefs(columns: DatasetColumn[]): KpiDef[] {
  const defs: KpiDef[] = []
  const id = columnsOfType(columns, "id")[0]
  defs.push(
    id
      ? {
          id: "entities",
          label: entityLabel(id.name),
          column: id.name,
          aggregation: "count_distinct",
          format: "number",
        }
      : {
          id: "rows",
          label: "Rows",
          column: null,
          aggregation: "count",
          format: "number",
        }
  )
  for (const measure of rankedMeasures(columns).slice(0, 2)) {
    const aggregation = defaultAggregation(measure.name)
    defs.push({
      id: `m:${measure.name}`,
      label: measureLabel(measure.name, aggregation),
      column: measure.name,
      aggregation,
      format: valueFormat(measure.name, aggregation),
    })
  }
  const flag = flagColumns(columns)[0]
  if (flag) {
    defs.push({
      id: `rate:${flag.name}`,
      label: `${flagNoun(flag.name)} rate`,
      column: flag.name,
      aggregation: "avg",
      format: "percent",
      scale: 100,
    })
  }
  return defs.slice(0, 4)
}

function value(rows: Row[], def: KpiDef) {
  const raw = aggregate(rows, def.column ?? undefined, def.aggregation)
  return Math.round(raw * (def.scale ?? 1) * 100) / 100
}

function inRange(rows: Row[], column: string, from: number, to: number) {
  return rows.filter((row) => {
    const v = row[column]
    if (typeof v !== "string") return false
    const d = dayIndex(v)
    return d >= from && d <= to
  })
}

export function computeKpis(
  rows: Row[],
  columns: DatasetColumn[],
  dateColumn: string | null,
  filters: Filters = {}
): Kpi[] {
  const whereOnly = applyFilters(rows, { where: filters.where })
  const selected = applyFilters(whereOnly, { dateRange: filters.dateRange })

  // Comparison windows on the date column.
  let windows: {
    current: [number, number]
    previous: [number, number]
    label: string
  } | null = null
  if (dateColumn) {
    const range = filters.dateRange
    if (range?.from && range.to) {
      const from = dayIndex(range.from)
      const to = dayIndex(range.to)
      const length = to - from + 1
      windows = {
        current: [from, to],
        previous: [from - length, from - 1],
        label: `vs previous ${length} days`,
      }
    } else {
      const days = selected
        .map((r) => r[dateColumn])
        .filter((v): v is string => typeof v === "string")
        .map(dayIndex)
      if (days.length) {
        const max = Math.max(...days)
        const min = Math.min(...days)
        const width = Math.min(30, Math.floor((max - min + 1) / 2))
        if (width >= 1) {
          windows = {
            current: [max - width + 1, max],
            previous: [max - 2 * width + 1, max - width],
            label: `Last ${width} days vs prior ${width}`,
          }
        }
      }
    }
  }

  return kpiDefs(columns).map((def) => {
    let delta: number | null = null
    if (windows && dateColumn) {
      const current = value(
        inRange(whereOnly, dateColumn, ...windows.current),
        def
      )
      const previous = value(
        inRange(whereOnly, dateColumn, ...windows.previous),
        def
      )
      delta = previous
        ? Math.round(((current - previous) / Math.abs(previous)) * 10_000) /
          10_000
        : null
    }
    return {
      id: def.id,
      label: def.label,
      column: def.column,
      aggregation: def.aggregation,
      value: value(selected, def),
      delta,
      deltaLabel: delta === null || !windows ? null : windows.label,
      format: def.format,
    }
  })
}
