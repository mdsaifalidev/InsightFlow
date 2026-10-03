import { count, createRng, int, round, weighted } from "../random"
import type { ParsedTable, Row } from "../types"

// Monthly account snapshots for a B2B SaaS, Jan 2024 - Dec 2025 (~9k rows).
// Planted story: Starter churn spikes in June 2025 (a pricing change).

const plans = [
  ["Starter", 55, 12],
  ["Growth", 35, 29],
  ["Scale", 10, 64],
] as const

const countries = [
  ["United States", 38],
  ["United Kingdom", 12],
  ["Germany", 11],
  ["India", 10],
  ["Canada", 8],
  ["Australia", 7],
  ["Brazil", 6],
  ["Japan", 8],
] as const

const churnRate = { Starter: 0.03, Growth: 0.015, Scale: 0.008 } as const

type Account = {
  id: string
  plan: (typeof plans)[number][0]
  pricePerSeat: number
  country: string
  seats: number
  startMonth: number
}

export function generateSaas(): ParsedTable {
  const rng = createRng(20240101)
  const rows: Row[] = []
  const active: Account[] = []
  let seq = 1

  const newAccount = (month: number): Account => {
    const [plan, , pricePerSeat] = weighted(
      rng,
      plans.map((p) => [p, p[1]] as const)
    )
    return {
      id: `ACC-${String(seq++).padStart(5, "0")}`,
      plan,
      pricePerSeat,
      country: weighted(rng, countries),
      seats:
        plan === "Scale"
          ? int(rng, 25, 120)
          : plan === "Growth"
            ? int(rng, 6, 30)
            : int(rng, 1, 6),
      startMonth: month,
    }
  }

  for (let i = 0; i < 250; i++) active.push(newAccount(-1))

  for (let m = 0; m < 24; m++) {
    const monthIso = new Date(Date.UTC(2024, m, 1)).toISOString().slice(0, 10)
    const isJune2025 = m === 17
    for (let i = 0, n = count(rng, 16 + m * 0.4); i < n; i++) {
      active.push(newAccount(m))
    }

    for (let i = active.length - 1; i >= 0; i--) {
      const account = active[i]!
      // Seat growth for healthy accounts.
      if (m > account.startMonth && rng() < 0.08) account.seats += 1
      const rate =
        isJune2025 && account.plan === "Starter"
          ? 0.14
          : churnRate[account.plan]
      const churned = m > account.startMonth && rng() < rate

      rows.push({
        month: monthIso,
        account_id: account.id,
        plan: account.plan,
        country: account.country,
        seats: account.seats,
        mrr: round(account.seats * account.pricePerSeat),
        is_new: account.startMonth === m,
        churned,
      })
      if (churned) active.splice(i, 1)
    }
  }

  rows.sort((a, b) =>
    a.month === b.month
      ? String(a.account_id).localeCompare(String(b.account_id))
      : String(a.month).localeCompare(String(b.month))
  )
  return {
    columns: Object.keys(rows[0]!).map((name) => ({
      name,
      originalName: name,
    })),
    rows,
  }
}
