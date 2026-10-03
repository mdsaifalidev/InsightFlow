import { describe, expect, it } from "vitest"

import type { DatasetColumn } from "@/lib/api/types"

import { autoWidgetSpecs, barScore } from "./dashboard"

/** A categorical column with a given distribution of values. */
function category(
  name: string,
  counts: number[],
  { position = 0, nullPct = 0 } = {}
): DatasetColumn {
  return {
    name,
    inferredType: "categorical",
    overrideType: null,
    position,
    profile: {
      nullPct,
      distinctCount: counts.length,
      categorical: {
        top: counts.map((count, i) => ({ value: `v${i}`, count })),
      },
    },
  } as DatasetColumn
}

const measure: DatasetColumn = {
  name: "revenue",
  inferredType: "numeric",
  overrideType: null,
  position: 9,
  profile: {
    nullPct: 0,
    distinctCount: 500,
    numeric: { min: 1, max: 9, mean: 5, median: 5, p95: 9, sum: 500 },
  },
} as DatasetColumn

describe("barScore", () => {
  it("prefers one clear leader over a near-constant column", () => {
    const dominated = category("status", [930, 30, 20, 10, 5, 5])
    const leading = category("region", [344, 300, 200, 100, 56])
    expect(barScore(leading)).toBeGreaterThan(barScore(dominated))
  })

  it("prefers one clear leader over a flat wall of equal bars", () => {
    const uniform = category("uuid_bucket", [100, 100, 100, 100, 100])
    const leading = category("region", [344, 300, 200, 100, 56])
    expect(barScore(leading)).toBeGreaterThan(barScore(uniform))
  })

  it("penalises hard-to-read and half-empty columns", () => {
    const counts = [50, 30, 20]
    const readable = category("plan", counts)
    const wide = category("city", [...counts, ...Array(15).fill(1)])
    const sparse = category("plan", counts, { nullPct: 0.5 })
    expect(barScore(readable)).toBeGreaterThan(barScore(wide))
    expect(barScore(readable)).toBeGreaterThan(barScore(sparse))
  })

  it("scores the same numbers as the Python engine", () => {
    // Exact values, so the two engines can't drift apart silently.
    expect(barScore(category("region", [344, 300, 200, 100, 56]))).toBe(0.744)
    expect(barScore(category("status", [930, 30, 20, 10, 5, 5]))).toBe(0.505)
    expect(barScore(category("uniform", [100, 100, 100, 100, 100]))).toBe(0.6)
  })

  it("scores a column with no profiled values at zero", () => {
    expect(barScore(category("empty", []))).toBe(0)
  })
})

describe("autoWidgetSpecs", () => {
  it("leads with the best-scoring bar, not the first column", () => {
    // status is 93% one value: a single bar with dust beside it, and today it
    // would lead the dashboard purely because it comes first.
    const columns = [
      category("status", [930, 30, 20, 10, 5, 5], { position: 0 }),
      category("region", [344, 300, 200, 100, 56], { position: 1 }),
      measure,
    ]
    const bars = autoWidgetSpecs(columns, null).filter(
      (s) => s.chartType === "bar"
    )
    expect(bars.map((s) => s.x)).toEqual(["region", "status"])
  })

  it("keeps column order when the scores tie", () => {
    const counts = [50, 30, 20]
    const columns = [
      category("b_first", counts, { position: 0 }),
      category("a_second", counts, { position: 1 }),
      measure,
    ]
    const bars = autoWidgetSpecs(columns, null).filter(
      (s) => s.chartType === "bar"
    )
    expect(bars.map((s) => s.x)).toEqual(["b_first", "a_second"])
  })
})
