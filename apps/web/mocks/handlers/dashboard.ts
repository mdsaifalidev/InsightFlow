import { http, HttpResponse } from "msw"

import type {
  DashboardResponse,
  FilterValuesResponse,
  Filters,
  QueryRequest,
  QueryResponse,
  RowsResponse,
} from "@/lib/api/types"

import { datasetColumns, dateColumnOf, ensureDashboard } from "../db/analytics"
import { computeKpis } from "../db/engine/kpis"
import { applyFilters, runWidget, sortRows } from "../db/engine/query"
import { getTypedRows } from "../db/engine/typed-rows"
import type { StoredDataset } from "../db/store"
import { latency, problem, requireAuth } from "../http"
import { findDataset } from "./datasets"

const PAGE_SIZES = [25, 50, 100, 250]

function readyDataset(request: Request, id: string): StoredDataset {
  const { workspace } = requireAuth(request)
  const dataset = findDataset(workspace.id, id)
  if (dataset.status !== "ready") {
    throw problem(409, "Dataset not ready", "This dataset is still processing.")
  }
  return dataset
}

/** Drops filters on unknown columns so stale URLs can't break a page. */
function sanitizeFilters(
  dataset: StoredDataset,
  filters: Filters | undefined
): Filters {
  const names = new Set(datasetColumns(dataset).map((c) => c.name))
  const dateColumn = dateColumnOf(dataset)
  const range = filters?.dateRange
  return {
    dateRange:
      range && dateColumn && (range.from || range.to)
        ? { column: dateColumn, from: range.from, to: range.to }
        : undefined,
    where: (filters?.where ?? []).filter(
      (w) => names.has(w.column) && w.values.length
    ),
  }
}

function parseFilters(raw: string | null): Filters | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as Filters
  } catch {
    throw problem(400, "Invalid filters", "The filters parameter must be JSON.")
  }
}

export const dashboardHandlers = [
  http.get("*/api/data/datasets/:id/dashboard", async ({ request, params }) => {
    await latency(0.8)
    const dataset = readyDataset(request, String(params.id))
    const widgets = await ensureDashboard(dataset)
    const rows = await getTypedRows(dataset)
    const dateColumn = dateColumnOf(dataset)
    const body: DashboardResponse = {
      kpis: computeKpis(rows, datasetColumns(dataset), dateColumn),
      widgets,
      dateColumn,
    }
    return HttpResponse.json(body)
  }),

  http.post("*/api/data/datasets/:id/query", async ({ request, params }) => {
    await latency()
    const dataset = readyDataset(request, String(params.id))
    const body = (await request.json()) as QueryRequest
    const filters = sanitizeFilters(dataset, body.filters)
    const rows = await getTypedRows(dataset)
    const filtered = applyFilters(rows, filters)
    const response: QueryResponse = {
      kpis: body.kpis
        ? computeKpis(
            rows,
            datasetColumns(dataset),
            dateColumnOf(dataset),
            filters
          )
        : [],
      results: (body.widgets ?? []).map(({ id, spec }) =>
        runWidget(id, filtered, spec)
      ),
    }
    return HttpResponse.json(response)
  }),

  http.get("*/api/data/datasets/:id/rows", async ({ request, params }) => {
    await latency(0.6)
    const dataset = readyDataset(request, String(params.id))
    const url = new URL(request.url)
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1)
    const requested = Number(url.searchParams.get("pageSize") ?? 50)
    const pageSize = PAGE_SIZES.includes(requested) ? requested : 50
    const columns = datasetColumns(dataset).map((c) => c.name)

    let rows = applyFilters(
      await getTypedRows(dataset),
      sanitizeFilters(dataset, parseFilters(url.searchParams.get("filters")))
    )
    const [sortColumn, direction] = (url.searchParams.get("sort") ?? "").split(
      ":"
    )
    if (sortColumn && columns.includes(sortColumn)) {
      rows = sortRows(rows, sortColumn, direction === "desc" ? "desc" : "asc")
    }

    const body: RowsResponse = {
      columns,
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      total: rows.length,
    }
    return HttpResponse.json(body)
  }),

  http.get(
    "*/api/data/datasets/:id/filters/:column/values",
    async ({ request, params }) => {
      await latency(0.5)
      const dataset = readyDataset(request, String(params.id))
      const column = String(params.column)
      if (!datasetColumns(dataset).some((c) => c.name === column)) {
        return problem(404, "Column not found")
      }
      const q = new URL(request.url).searchParams.get("q")?.toLowerCase() ?? ""
      const counts = new Map<string, number>()
      for (const row of await getTypedRows(dataset)) {
        const v = row[column]
        if (v === null || v === undefined) continue
        const key = String(v)
        if (q && !key.toLowerCase().includes(q)) continue
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
      const body: FilterValuesResponse = {
        column,
        values: [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 100)
          .map(([value, count]) => ({ value, count })),
      }
      return HttpResponse.json(body)
    }
  ),
]
