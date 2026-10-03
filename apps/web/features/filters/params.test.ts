import { createSerializer } from "nuqs"
import { describe, expect, it } from "vitest"

import { filterParams, resolveDateRange, toApiFilters } from "./params"

describe("resolveDateRange", () => {
  const latest = "2025-12-31"

  it("resolves presets relative to the dataset's latest date", () => {
    expect(resolveDateRange("7d", null, null, latest)).toEqual({
      from: "2025-12-25",
      to: "2025-12-31",
    })
    expect(
      resolveDateRange("30d", null, null, "2025-09-30T23:10:00.000Z")
    ).toEqual({
      from: "2025-09-01",
      to: "2025-09-30",
    })
    expect(resolveDateRange("ytd", null, null, latest)).toEqual({
      from: "2025-01-01",
      to: latest,
    })
    expect(resolveDateRange("all", null, null, latest)).toBeUndefined()
  })

  it("accepts custom ranges in either order and ignores malformed dates", () => {
    expect(
      resolveDateRange("custom", "2025-05-01", "2025-04-01", latest)
    ).toEqual({
      from: "2025-04-01",
      to: "2025-05-01",
    })
    expect(
      resolveDateRange("custom", "yesterday", "2025-04-01", latest)
    ).toBeUndefined()
  })
})

describe("filter URL state", () => {
  const serialize = createSerializer(filterParams)

  it("round-trips category filters through the URL", () => {
    const where = [{ column: "region", values: ["Europe", "North America"] }]
    const url = serialize("/app/datasets/1", { range: "30d", where })
    const search = new URL(url, "http://x").searchParams
    expect(search.get("range")).toBe("30d")
    expect(filterParams.where.parse(search.get("where")!)).toEqual(where)
  })

  it("rejects tampered filter JSON", () => {
    expect(filterParams.where.parse('[{"column":"region"}]')).toBeNull()
  })

  it("builds the API filter shape", () => {
    expect(
      toApiFilters("day", { from: "2025-01-01", to: "2025-01-31" }, [
        { column: "region", values: ["EU"] },
      ])
    ).toEqual({
      dateRange: { column: "day", from: "2025-01-01", to: "2025-01-31" },
      where: [{ column: "region", op: "in", values: ["EU"] }],
    })
  })
})
