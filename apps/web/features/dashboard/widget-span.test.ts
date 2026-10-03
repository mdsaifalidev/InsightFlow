import { describe, expect, it } from "vitest"

import type { ChartType, Widget } from "@/lib/api/types"

import { widgetSpan } from "./widget-span"

function widget(chartType: ChartType, position = 0): Widget {
  return {
    id: `w-${chartType}-${position}`,
    datasetId: "d1",
    kind: "auto",
    spec: { chartType, title: "t", x: "x", aggregation: "sum" },
    position,
    createdAt: "2025-01-01T00:00:00.000Z",
  }
}

const LEAD = "md:col-span-2"

describe("widgetSpan", () => {
  it("gives the lead trend the full row", () => {
    expect(widgetSpan(widget("line"), 0)).toBe(LEAD)
  })

  it("treats a lead area chart as a trend too", () => {
    // The bug this file exists for. The old inline rule was
    // `chartType === "line"`, so an area-led dashboard never went wide.
    expect(widgetSpan(widget("area"), 0)).toBe(LEAD)
  })

  it("only the lead is wide", () => {
    for (const type of ["line", "area", "bar", "donut", "histogram"] as const) {
      expect(widgetSpan(widget(type), 1), `${type}@1`).toBe("")
      expect(widgetSpan(widget(type), 4), `${type}@4`).toBe("")
    }
  })

  it("a lead that is not a time series stays one column", () => {
    // Categorical charts read fine at half width; width would be wasted.
    for (const type of ["bar", "donut", "histogram"] as const) {
      expect(widgetSpan(widget(type), 0), type).toBe("")
    }
  })

  /**
   * How `grid-flow-dense` packs: each tile goes in the first row it fits.
   * Kept because it is the check that rejected a mixed-span mosaic, and the
   * check to re-run if widget kinds ever diversify enough to justify one.
   */
  function packDense(
    types: ChartType[],
    columns: number,
    width: (t: ChartType, i: number) => number
  ) {
    const rows: number[] = []
    for (const [i, type] of types.entries()) {
      const w = width(type, i)
      const row = rows.findIndex((used) => used + w <= columns)
      if (row === -1) rows.push(w)
      else rows[row] = rows[row]! + w
    }
    return rows
  }

  /** The real auto-dashboard shapes, from services/data-py/tests/golden/*.json. */
  const SHAPES: Record<string, ChartType[]> = {
    orders: ["line", "bar", "bar", "donut", "histogram"],
    saas: ["line", "line", "bar", "bar", "histogram"],
    weblogs: ["line", "area", "bar", "bar", "donut", "histogram"],
  }

  it("leaves no hole in a middle row on any real dashboard shape", () => {
    // A short LAST row is normal in a grid; a gap in a middle row reads as
    // broken. Two columns, lead spans both.
    for (const [name, types] of Object.entries(SHAPES)) {
      const rows = packDense(types, 2, (t, i) =>
        widgetSpan(widget(t, i), i) === LEAD ? 2 : 1
      )
      for (const [i, used] of rows.entries()) {
        if (i === rows.length - 1) continue
        expect(used, `${name} row ${i + 1} has a hole`).toBe(2)
      }
    }
  })

  it("records why a narrower donut tier was rejected", () => {
    // Six columns, donut 2, other breakdowns 3. weblogs strands a column in a
    // middle row — this is the evidence behind the note in widget-span.ts, and
    // it fails here rather than living only in a comment.
    const rows = packDense(SHAPES.weblogs!, 6, (t, i) =>
      i === 0 ? 6 : t === "donut" ? 2 : 3
    )
    const middles = rows.slice(0, -1)
    expect(middles).toContain(5)
    expect(middles.some((used) => used < 6)).toBe(true)
  })
})
