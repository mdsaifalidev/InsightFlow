import { describe, expect, it } from "vitest"

import { generateOrders } from "./orders"
import { generateSaas } from "./saas"
import { generateWeblogs } from "./weblogs"

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0)

describe("sample datasets", () => {
  it("are deterministic", () => {
    expect(generateOrders().rows.slice(0, 5)).toEqual(
      generateOrders().rows.slice(0, 5)
    )
    expect(generateWeblogs().rows.length).toBe(generateWeblogs().rows.length)
  })

  it("orders: Electronics revenue drops in April while volume holds", () => {
    const { rows } = generateOrders()
    expect(rows.length).toBeGreaterThan(10_000)
    const electronics = (month: string) =>
      rows.filter(
        (r) =>
          r.category === "Electronics" && String(r.order_date).startsWith(month)
      )
    const march = electronics("2025-03")
    const april = electronics("2025-04")
    const revenue = (list: typeof rows) =>
      sum(list.map((r) => Number(r.revenue)))

    expect(revenue(april) / revenue(march)).toBeLessThan(0.7)
    expect(april.length / march.length).toBeGreaterThan(0.85)
  })

  it("orders: Black Friday volume spikes", () => {
    const { rows } = generateOrders()
    const perDay = (day: string) =>
      rows.filter((r) => r.order_date === day).length
    expect(perDay("2025-11-28")).toBeGreaterThan(perDay("2025-11-21") * 2.5)
  })

  it("saas: Starter churn spikes in June 2025", () => {
    const { rows } = generateSaas()
    const churnRate = (month: string) => {
      const starter = rows.filter(
        (r) => r.plan === "Starter" && r.month === month
      )
      return starter.filter((r) => r.churned).length / starter.length
    }
    expect(churnRate("2025-06-01")).toBeGreaterThan(
      churnRate("2025-05-01") * 2.5
    )
  })

  it("weblogs: checkout latency and errors spike on Sep 18", () => {
    const { rows } = generateWeblogs()
    // Compare the whole 13:00-17:00 window: single hours have too few requests.
    const checkout = (day: string) =>
      rows.filter((r) => {
        const ts = String(r.timestamp)
        const hour = Number(ts.slice(11, 13))
        return (
          r.path === "/api/checkout" &&
          ts.startsWith(day) &&
          hour >= 13 &&
          hour < 17
        )
      })
    const avg = (list: typeof rows) =>
      sum(list.map((r) => Number(r.latency_ms))) / list.length
    const incident = checkout("2025-09-18")
    const normalDay = checkout("2025-09-17")

    expect(avg(incident)).toBeGreaterThan(avg(normalDay) * 3)
    expect(incident.some((r) => Number(r.status) >= 500)).toBe(true)
  })
})
