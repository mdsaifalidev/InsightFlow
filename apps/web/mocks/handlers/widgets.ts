import { http, HttpResponse } from "msw"

import type {
  Aggregation,
  ChartType,
  CreateWidgetRequest,
  DatasetColumn,
  UpdateWidgetRequest,
  Widget,
  WidgetSpec,
} from "@/lib/api/types"

import { datasetColumns, ensureDashboard, widgetsOf } from "../db/analytics"
import { effectiveType } from "../db/engine/measures"
import { db, mutate, newId, nowIso } from "../db/store"
import { latency, problem, requireAuth } from "../http"
import { findDataset } from "./datasets"

const CHART_TYPES: ChartType[] = ["line", "area", "bar", "donut", "histogram"]
const AGGREGATIONS: Aggregation[] = [
  "sum",
  "avg",
  "count",
  "min",
  "max",
  "count_distinct",
]
const X_TYPES: Record<ChartType, string[]> = {
  line: ["datetime"],
  area: ["datetime"],
  bar: ["categorical", "boolean", "text"],
  donut: ["categorical", "boolean"],
  histogram: ["numeric"],
}

/** Server-side spec validation; errors are keyed by spec field. */
export function validateSpec(
  spec: Partial<WidgetSpec> | undefined,
  columns: DatasetColumn[]
) {
  const errors: Record<string, string> = {}
  const byName = new Map(columns.map((c) => [c.name, effectiveType(c)]))
  if (!spec) return { spec: "Missing chart spec." }
  if (!spec.title?.trim()) errors.title = "Give the chart a title."
  if (!spec.chartType || !CHART_TYPES.includes(spec.chartType)) {
    errors.chartType = "Choose a chart type."
    return errors
  }
  if (!spec.x || !byName.has(spec.x))
    errors.x = "Choose a column for the x axis."
  else if (!X_TYPES[spec.chartType].includes(byName.get(spec.x)!)) {
    errors.x = "This column can't be used on this chart's x axis."
  }
  if (!spec.aggregation || !AGGREGATIONS.includes(spec.aggregation)) {
    errors.aggregation = "Choose how to summarize values."
  } else if (spec.aggregation !== "count" && spec.chartType !== "histogram") {
    const yType = spec.y ? byName.get(spec.y) : undefined
    if (!yType) errors.y = "Choose a value column."
    else if (
      spec.aggregation !== "count_distinct" &&
      yType !== "numeric" &&
      yType !== "boolean"
    ) {
      errors.y = "Only number columns can be summed or averaged."
    }
  }
  if (spec.split) {
    if (!byName.has(spec.split)) errors.split = "Unknown column."
    else if (spec.chartType === "donut" || spec.chartType === "histogram") {
      errors.split = "This chart type can't be split into series."
    }
  }
  return errors
}

function clean(spec: WidgetSpec): WidgetSpec {
  return {
    chartType: spec.chartType,
    title: spec.title.trim(),
    x: spec.x,
    y:
      spec.aggregation === "count" || spec.chartType === "histogram"
        ? undefined
        : spec.y,
    aggregation: spec.chartType === "histogram" ? "count" : spec.aggregation,
    split: spec.split || undefined,
    timeGrain:
      spec.chartType === "line" || spec.chartType === "area"
        ? (spec.timeGrain ?? "month")
        : undefined,
    limit: spec.limit,
  }
}

function findWidget(datasetId: string, widgetId: string): Widget {
  const widget = db().widgets.find(
    (w) => w.id === widgetId && w.datasetId === datasetId
  )
  if (!widget) throw problem(404, "Chart not found")
  return widget
}

export const widgetHandlers = [
  http.get("*/api/data/datasets/:id/widgets", async ({ request, params }) => {
    await latency(0.5)
    const { workspace } = requireAuth(request)
    const dataset = findDataset(workspace.id, String(params.id))
    return HttpResponse.json(await ensureDashboard(dataset))
  }),

  http.post("*/api/data/datasets/:id/widgets", async ({ request, params }) => {
    await latency()
    const { workspace } = requireAuth(request)
    const dataset = findDataset(workspace.id, String(params.id))
    const { spec } = (await request.json()) as CreateWidgetRequest
    const errors = validateSpec(spec, datasetColumns(dataset))
    if (Object.keys(errors).length) {
      return problem(
        422,
        "Validation failed",
        "Check the chart settings.",
        errors
      )
    }
    await ensureDashboard(dataset)
    const widget: Widget = {
      id: newId(),
      datasetId: dataset.id,
      kind: "custom",
      spec: clean(spec),
      position: widgetsOf(dataset.id).length,
      createdAt: nowIso(),
    }
    mutate((s) => {
      s.widgets.push(widget)
    })
    return HttpResponse.json(widget, { status: 201 })
  }),

  http.patch(
    "*/api/data/datasets/:id/widgets/:widgetId",
    async ({ request, params }) => {
      await latency()
      const { workspace } = requireAuth(request)
      const dataset = findDataset(workspace.id, String(params.id))
      const widget = findWidget(dataset.id, String(params.widgetId))
      if (widget.kind !== "custom") {
        return problem(
          409,
          "Built-in chart",
          "Built-in charts can't be edited. Add a new chart instead."
        )
      }
      const { spec } = (await request.json()) as UpdateWidgetRequest
      const errors = validateSpec(spec, datasetColumns(dataset))
      if (Object.keys(errors).length) {
        return problem(
          422,
          "Validation failed",
          "Check the chart settings.",
          errors
        )
      }
      const updated = mutate((s) => {
        const target = s.widgets.find((w) => w.id === widget.id)!
        target.spec = clean(spec)
        return { ...target }
      })
      return HttpResponse.json(updated)
    }
  ),

  http.delete(
    "*/api/data/datasets/:id/widgets/:widgetId",
    async ({ request, params }) => {
      await latency()
      const { workspace } = requireAuth(request)
      const dataset = findDataset(workspace.id, String(params.id))
      const widget = findWidget(dataset.id, String(params.widgetId))
      mutate((s) => {
        s.widgets = s.widgets.filter((w) => w.id !== widget.id)
      })
      return new HttpResponse(null, { status: 204 })
    }
  ),
]
