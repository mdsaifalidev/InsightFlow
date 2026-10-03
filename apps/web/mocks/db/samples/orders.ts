import { count, createRng, normal, round, weighted } from "../random"
import type { ParsedTable, Row } from "../types"

// E-commerce orders for 2025 (~12k rows).
// Planted stories for the Brief:
//  - April: Electronics baskets shrink (~-40% revenue) while order volume holds.
//  - Nov 28 (Black Friday): order volume spikes ~4x with deeper discounts.

const regions = [
  ["North America", 34],
  ["Europe", 28],
  ["Asia Pacific", 20],
  ["Latin America", 10],
  ["Middle East & Africa", 8],
] as const

const categories = [
  ["Electronics", 24, 180],
  ["Home & Kitchen", 22, 62],
  ["Apparel", 20, 45],
  ["Beauty", 14, 28],
  ["Sports & Outdoors", 12, 74],
  ["Toys", 8, 35],
] as const

const channels = [
  ["Web", 48],
  ["Mobile app", 34],
  ["Marketplace", 12],
  ["Retail partner", 6],
] as const

const BLACK_FRIDAY = "2025-11-28"

export function generateOrders(): ParsedTable {
  const rng = createRng(20250101)
  const rows: Row[] = []
  let seq = 1

  for (let day = 0; day < 365; day++) {
    const date = new Date(Date.UTC(2025, 0, 1 + day))
    const iso = date.toISOString().slice(0, 10)
    const month = date.getUTCMonth()
    const weekday = date.getUTCDay()

    const weekly = weekday === 0 || weekday === 6 ? 1.15 : 1
    const trend = 1 + day / 365 / 4
    const holiday = month === 11 ? 1.12 : 1
    const blackFriday = iso === BLACK_FRIDAY ? 4.2 : 1
    const orders = count(rng, 28 * weekly * trend * holiday * blackFriday)

    for (let i = 0; i < orders; i++) {
      const [category, , basePrice] = weighted(
        rng,
        categories.map((c) => [c, c[1]] as const)
      )
      const aprilDip = category === "Electronics" && month === 3 ? 0.58 : 1
      const unitPrice = round(
        Math.max(4, basePrice * Math.exp(normal(rng, 0, 0.35)) * aprilDip)
      )
      const quantity = weighted(rng, [
        [1, 55],
        [2, 25],
        [3, 11],
        [4, 6],
        [5, 3],
      ] as const)
      const discountPct =
        iso === BLACK_FRIDAY
          ? weighted(rng, [
              [20, 50],
              [30, 35],
              [40, 15],
            ] as const)
          : weighted(rng, [
              [0, 58],
              [5, 18],
              [10, 14],
              [15, 7],
              [20, 3],
            ] as const)

      rows.push({
        order_id: `ORD-${String(seq++).padStart(6, "0")}`,
        order_date: iso,
        region: weighted(rng, regions),
        category,
        channel: weighted(rng, channels),
        customer_type: rng() < 0.38 ? "New" : "Returning",
        quantity,
        unit_price: unitPrice,
        discount_pct: discountPct,
        revenue: round(quantity * unitPrice * (1 - discountPct / 100)),
      })
    }
  }

  return {
    columns: Object.keys(rows[0]!).map((name) => ({
      name,
      originalName: name,
    })),
    rows,
  }
}
