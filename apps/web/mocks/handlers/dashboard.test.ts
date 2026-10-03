// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"

import { apiFetch, ApiError } from "@/lib/api-client"
import type {
  AuthResponse,
  DashboardResponse,
  FilterValuesResponse,
  Insight,
  QueryResponse,
  RegenerateInsightResponse,
  RowsResponse,
  UploadResponse,
  Widget,
} from "@/lib/api/types"
import { setAccessToken } from "@/lib/auth-token"
import { streamEvents } from "@/lib/sse"

import { REGENERATE_LIMIT } from "./insights"

async function waitForJob(jobId: string) {
  let done = false
  const controller = new AbortController()
  await streamEvents(`/api/data/jobs/${jobId}/events`, {
    signal: controller.signal,
    isDone: () => done,
    onMessage: (m) => {
      if (m.event === "done") {
        done = true
        controller.abort()
      }
    },
  })
}

let datasetId = ""

describe("mock dashboard service", () => {
  beforeEach(async () => {
    setAccessToken(null)
    const auth = await apiFetch<AuthResponse>("/api/auth/register", {
      method: "POST",
      body: {
        name: "Maya",
        email: "maya@example.com",
        password: "long-enough",
      },
    })
    setAccessToken(auth.accessToken)
    const { dataset, jobId } = await apiFetch<UploadResponse>(
      "/api/data/datasets/sample",
      {
        method: "POST",
        body: { key: "orders" },
      }
    )
    await waitForJob(jobId)
    datasetId = dataset.id
  })

  it("builds a dashboard with KPIs and auto charts during ingest", async () => {
    const dashboard = await apiFetch<DashboardResponse>(
      `/api/data/datasets/${datasetId}/dashboard`
    )
    expect(dashboard.dateColumn).toBe("order_date")
    expect(dashboard.kpis.map((k) => k.label)).toEqual([
      "Orders",
      "Total revenue",
      "Average unit price",
    ])
    expect(dashboard.widgets[0]!.spec).toMatchObject({
      chartType: "line",
      x: "order_date",
      timeGrain: "month",
    })
  })

  it("applies filters consistently to KPIs and widgets", async () => {
    const { widgets } = await apiFetch<DashboardResponse>(
      `/api/data/datasets/${datasetId}/dashboard`
    )
    const query = (filters: object) =>
      apiFetch<QueryResponse>(`/api/data/datasets/${datasetId}/query`, {
        method: "POST",
        body: {
          widgets: widgets.map((w) => ({ id: w.id, spec: w.spec })),
          kpis: true,
          filters,
        },
      })
    const all = await query({})
    const eu = await query({
      where: [{ column: "region", op: "in", values: ["Europe"] }],
    })
    const orders = (r: QueryResponse) =>
      r.kpis.find((k) => k.label === "Orders")!.value
    expect(orders(eu)).toBeLessThan(orders(all))

    const byRegion = eu.results.find(
      (r) => r.widgetId === widgets.find((w) => w.spec.x === "region")!.id
    )!
    expect(byRegion.points.map((p) => p.x)).toEqual(["Europe"])
  })

  it("pages, sorts and filters rows", async () => {
    const filters = encodeURIComponent(
      JSON.stringify({
        dateRange: {
          column: "order_date",
          from: "2025-04-01",
          to: "2025-04-30",
        },
      })
    )
    const page = await apiFetch<RowsResponse>(
      `/api/data/datasets/${datasetId}/rows?page=2&pageSize=25&sort=revenue:desc&filters=${filters}`
    )
    expect(page).toMatchObject({ page: 2, pageSize: 25 })
    expect(page.rows).toHaveLength(25)
    const revenues = page.rows.map((r) => Number(r.revenue))
    expect([...revenues].sort((a, b) => b - a)).toEqual(revenues)
    expect(
      page.rows.every((r) => String(r.order_date).startsWith("2025-04"))
    ).toBe(true)
  })

  it("lists filter values with counts", async () => {
    const values = await apiFetch<FilterValuesResponse>(
      `/api/data/datasets/${datasetId}/filters/region/values?q=america`
    )
    expect(values.values.map((v) => v.value).sort()).toEqual([
      "Latin America",
      "North America",
    ])
  })

  it("creates, validates, edits and deletes custom charts", async () => {
    const base = `/api/data/datasets/${datasetId}/widgets`
    const invalid = await apiFetch(base, {
      method: "POST",
      body: {
        spec: { chartType: "line", title: "", x: "region", aggregation: "sum" },
      },
    }).catch((e: unknown) => e)
    expect((invalid as ApiError).status).toBe(422)
    expect(
      Object.keys((invalid as ApiError).problem.errors ?? {}).sort()
    ).toEqual(["title", "x", "y"])

    const created = await apiFetch<Widget>(base, {
      method: "POST",
      body: {
        spec: {
          chartType: "bar",
          title: "Avg discount by channel",
          x: "channel",
          y: "discount_pct",
          aggregation: "avg",
        },
      },
    })
    expect(created.kind).toBe("custom")

    const updated = await apiFetch<Widget>(`${base}/${created.id}`, {
      method: "PATCH",
      body: { spec: { ...created.spec, title: "Discount by channel" } },
    })
    expect(updated.spec.title).toBe("Discount by channel")

    await apiFetch(`${base}/${created.id}`, { method: "DELETE" })
    const widgets = await apiFetch<Widget[]>(base)
    expect(widgets.some((w) => w.id === created.id)).toBe(false)
  })

  it("serves the brief and rate-limits regeneration", async () => {
    const insight = await apiFetch<Insight>(
      `/api/data/datasets/${datasetId}/insights/latest`
    )
    expect(insight.summary).toMatch(/April 2025/)

    for (let i = 0; i < REGENERATE_LIMIT; i++) {
      const { jobId } = await apiFetch<RegenerateInsightResponse>(
        `/api/data/datasets/${datasetId}/insights`,
        {
          method: "POST",
        }
      )
      await waitForJob(jobId)
    }
    const limited = await apiFetch(`/api/data/datasets/${datasetId}/insights`, {
      method: "POST",
    }).catch((e: unknown) => e)
    expect((limited as ApiError).status).toBe(429)
  })
})
