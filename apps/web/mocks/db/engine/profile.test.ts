import { describe, expect, it } from "vitest"

import { normalizeColumnNames, parseCsv, ParseError } from "./parse"
import { inferGrain, inferType, profileColumn, profileTable } from "./profile"

describe("inferType", () => {
  it("recognizes ids by name", () => {
    expect(inferType("order_id", ["ORD-1", "ORD-2"])).toBe("id")
    expect(inferType("id", [1, 2, 3])).toBe("id")
  })

  it("recognizes date formats", () => {
    expect(inferType("day", ["2025-04-01", "2025-04-02", ""])).toBe("datetime")
    expect(
      inferType("ts", ["2025-09-18T13:04:00Z", "2025-09-18 14:00:00"])
    ).toBe("datetime")
    expect(inferType("signup", ["04/01/2025", "12/31/2024"])).toBe("datetime")
  })

  it("treats numeric strings with nulls, separators and currency as numeric", () => {
    expect(inferType("amount", ["1,234.50", "$20", "", "7", null])).toBe(
      "numeric"
    )
  })

  it("reads small integer code sets as categories", () => {
    const statuses = Array.from({ length: 100 }, (_, i) => (i % 4 ? 200 : 404))
    expect(inferType("status", statuses)).toBe("categorical")
    expect(inferType("quantity", statuses)).toBe("numeric")
  })

  it("distinguishes booleans, categories and free text", () => {
    expect(inferType("active", ["yes", "no", "Yes"])).toBe("boolean")
    const regions = Array.from(
      { length: 500 },
      (_, i) => ["EU", "US", "APAC"][i % 3]!
    )
    expect(inferType("region", regions)).toBe("categorical")
    const notes = Array.from(
      { length: 500 },
      (_, i) => `note number ${i} about something`
    )
    expect(inferType("notes", notes)).toBe("text")
  })
})

describe("profileColumn", () => {
  it("computes numeric stats, ignoring nulls", () => {
    const values = [...Array.from({ length: 100 }, (_, i) => i + 1), null]
    const profile = profileColumn(values, "numeric")
    expect(profile.nullPct).toBeCloseTo(1 / 101, 4)
    expect(profile.numeric).toMatchObject({
      min: 1,
      max: 100,
      mean: 50.5,
      median: 50.5,
      sum: 5050,
    })
    expect(profile.numeric!.p95).toBeCloseTo(95.05, 2)
  })

  it("returns top values for categories", () => {
    const profile = profileColumn(["a", "b", "a", "c", "a", "b"], "categorical")
    expect(profile.distinctCount).toBe(3)
    expect(profile.categorical!.top[0]).toEqual({ value: "a", count: 3 })
  })

  it("infers a time grain from the date span", () => {
    expect(inferGrain("2025-09-18T00:00:00Z", "2025-09-19T12:00:00Z")).toBe(
      "hour"
    )
    expect(inferGrain("2025-09-01", "2025-09-30")).toBe("day")
    expect(inferGrain("2025-01-01", "2025-12-31")).toBe("week")
    expect(inferGrain("2020-01-01", "2025-12-31")).toBe("month")
  })
})

describe("parsing", () => {
  it("normalizes and dedupes headers, keeping the originals", () => {
    expect(
      normalizeColumnNames(["Order Date", "Revenue ($)", "revenue", "", "2024"])
    ).toEqual([
      { name: "order_date", originalName: "Order Date" },
      { name: "revenue", originalName: "Revenue ($)" },
      { name: "revenue_2", originalName: "revenue" },
      { name: "column_4", originalName: "column_4" },
      { name: "c_2024", originalName: "2024" },
    ])
  })

  it("parses and types a CSV end to end", () => {
    const table = parseCsv(
      '\uFEFFDate,Region,Amount\n2025-01-02,EU,"1,200.50"\n2025-01-03,US,80\n'
    )
    const profiled = profileTable(
      table.columns.map((c) => c.name),
      table.rows
    )
    expect(profiled.map((c) => c.type)).toEqual([
      "datetime",
      "categorical",
      "numeric",
    ])
    expect(table.rows[0]).toEqual({
      date: "2025-01-02",
      region: "EU",
      amount: 1200.5,
    })
  })

  it("reports ragged rows with the row number", () => {
    expect(() => parseCsv("a,b\n1,2\n3,4,5\n")).toThrow(ParseError)
    expect(() => parseCsv("a,b\n1,2\n3,4,5\n")).toThrow(
      "Row 3 has 3 columns, expected 2."
    )
  })

  it("rejects files without data rows", () => {
    expect(() => parseCsv("a,b\n")).toThrow("no data rows")
  })
})
