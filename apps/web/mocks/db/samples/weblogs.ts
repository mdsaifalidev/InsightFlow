import { count, createRng, int, normal, weighted } from "../random"
import type { ParsedTable, Row } from "../types"

// 30 days of sampled HTTP requests, September 2025 (~20k rows).
// Planted story: on Sep 18, 13:00-17:00 UTC, /api/checkout latency jumps ~6x
// and a quarter of its requests return 5xx (a bad deploy).

const paths = [
  ["/", 22, "GET", 45],
  ["/products", 20, "GET", 80],
  ["/products/:id", 18, "GET", 60],
  ["/search", 12, "GET", 140],
  ["/cart", 10, "GET", 55],
  ["/api/cart", 8, "POST", 90],
  ["/api/checkout", 6, "POST", 220],
  ["/account", 4, "GET", 70],
] as const

const countries = [
  ["US", 36],
  ["GB", 10],
  ["DE", 9],
  ["IN", 12],
  ["BR", 7],
  ["JP", 8],
  ["FR", 8],
  ["CA", 10],
] as const

const devices = [
  ["Desktop", 46],
  ["Mobile", 47],
  ["Tablet", 7],
] as const

// Traffic by hour of day (UTC), peaks in the afternoon.
const hourly = Array.from(
  { length: 24 },
  (_, h) => 0.4 + Math.sin(((h - 6) / 24) * Math.PI * 2) * 0.35 + 0.35
)

export function generateWeblogs(): ParsedTable {
  const rng = createRng(20250901)
  const rows: Row[] = []

  for (let day = 0; day < 30; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const requests = count(rng, 27 * hourly[hour]!)
      for (let i = 0; i < requests; i++) {
        const [path, , method, baseLatency] = weighted(
          rng,
          paths.map((p) => [p, p[1]] as const)
        )
        const incident =
          day === 17 && hour >= 13 && hour < 17 && path === "/api/checkout"
        const ts = new Date(
          Date.UTC(2025, 8, 1 + day, hour, int(rng, 0, 59), int(rng, 0, 59))
        )
        const latency = Math.round(
          baseLatency * Math.exp(normal(rng, 0, 0.45)) * (incident ? 6 : 1)
        )
        const status =
          incident && rng() < 0.25
            ? weighted(rng, [
                [500, 3],
                [502, 2],
                [504, 5],
              ] as const)
            : weighted(rng, [
                [200, 930],
                [304, 30],
                [404, 25],
                [401, 8],
                [500, 4],
              ] as const)

        rows.push({
          timestamp: ts.toISOString(),
          path,
          method,
          status,
          latency_ms: latency,
          country: weighted(rng, countries),
          device: weighted(rng, devices),
        })
      }
    }
  }

  rows.sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
  return {
    columns: Object.keys(rows[0]!).map((name) => ({
      name,
      originalName: name,
    })),
    rows,
  }
}
