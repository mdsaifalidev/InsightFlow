import { describe, expect, it } from "vitest"

import type { DatasetColumn } from "@/lib/api/types"

import type { Row } from "../types"
import { computeKpis } from "./kpis"
import { aggregate, applyFilters, OTHER, runWidget, sortRows } from "./query"
import { bucket } from "./time"

const rows: Row[] = [
  { day: "2025-01-06", region: "EU", revenue: 100, ok: true },
  { day: "2025-01-07", region: "EU", revenue: 50, ok: false },
  { day: "2025-01-14", region: "US", revenue: 200, ok: true },
  { day: "2025-02-03", region: "APAC", revenue: 30, ok: true },
  { day: "2025-02-04", region: null, revenue: null, ok: null },
]

describe("filters and sorting", () => {
  it("filters by inclusive date range and category values", () => {
    const filtered = applyFilters(rows, {
      dateRange: { column: "day", from: "2025-01-07", to: "2025-01-31" },
      where: [{ column: "region", op: "in", values: ["EU", "US"] }],
    })
    expect(filtered.map((r) => r.revenue)).toEqual([50, 200])
  })

  it("sorts with nulls last in both directions", () => {
    expect(sortRows(rows, "revenue", "desc").map((r) => r.revenue)).toEqual([
      200,
      100,
      50,
      30,
      null,
    ])
    expect(sortRows(rows, "revenue", "asc").map((r) => r.revenue)).toEqual([
      30,
      50,
      100,
      200,
      null,
    ])
  })
})

describe("aggregation", () => {
  it("supports every aggregation, including booleans as 0/1", () => {
    expect(aggregate(rows, "revenue", "sum")).toBe(380)
    expect(aggregate(rows, "revenue", "avg")).toBe(95)
    expect(aggregate(rows, "revenue", "count")).toBe(5)
    expect(aggregate(rows, "region", "count_distinct")).toBe(3)
    expect(aggregate(rows, "ok", "avg")).toBe(0.75)
  })

  it("buckets by ISO week (Monday) and month", () => {
    expect(bucket("2025-01-08", "week")).toBe("2025-01-06")
    expect(bucket("2025-09-18T14:32:00.000Z", "hour")).toBe("2025-09-18T14:00")
    expect(bucket("2025-02-04", "month")).toBe("2025-02-01")
  })
})

describe("runWidget", () => {
  it("builds a zero-filled time series", () => {
    const result = runWidget("w", rows, {
      chartType: "line",
      title: "t",
      x: "day",
      y: "revenue",
      aggregation: "sum",
      timeGrain: "month",
    })
    expect(result.points).toEqual([
      { x: "2025-01-01", value: 350 },
      { x: "2025-02-01", value: 30 },
    ])
  })

  it("keeps the top categories and folds the rest into Other", () => {
    const result = runWidget("w", rows, {
      chartType: "bar",
      title: "t",
      x: "region",
      y: "revenue",
      aggregation: "sum",
      limit: 2,
    })
    expect(result.points).toEqual([
      { x: "US", value: 200 },
      { x: OTHER, value: 180 },
    ])
  })

  it("bins numbers for histograms", () => {
    const result = runWidget("w", rows, {
      chartType: "histogram",
      title: "t",
      x: "revenue",
      aggregation: "count",
    })
    expect(result.points).toHaveLength(20)
    expect(result.points.reduce((s, p) => s + Number(p.value), 0)).toBe(4)
  })
})

describe("computeKpis", () => {
  const column = (
    name: string,
    type: DatasetColumn["inferredType"],
    position: number
  ): DatasetColumn => ({
    id: name,
    name,
    originalName: name,
    position,
    inferredType: type,
    overrideType: null,
    profile: { nullPct: 0, distinctCount: 10 },
  })
  const columns = [
    column("day", "datetime", 0),
    column("region", "categorical", 1),
    column("revenue", "numeric", 2),
  ]

  it("compares the selected range with the previous one of equal length", () => {
    const kpis = computeKpis(rows, columns, "day", {
      dateRange: { column: "day", from: "2025-01-13", to: "2025-01-19" },
    })
    const revenue = kpis.find((k) => k.column === "revenue")!
    // Current week: 200; previous week (Jan 6–12): 150.
    expect(revenue).toMatchObject({
      value: 200,
      format: "currency",
      deltaLabel: "vs previous 7 days",
    })
    expect(revenue.delta).toBeCloseTo(1 / 3, 4)
  })
})
