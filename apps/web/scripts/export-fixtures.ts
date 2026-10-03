// Exports the seeded sample datasets as CSV for the Python data service, plus
// golden outputs of the TypeScript engine so both engines can be held to the
// same results (docs/adr/013). Run: pnpm --filter web fixtures:export
//
// The golden files are computed from the exported CSV text (not the typed
// generator rows), so they describe exactly what the Python service ingests.

import { mkdirSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import Papa from "papaparse"

import type {
  DatasetColumn,
  Filters,
  SampleKey,
  WidgetSpec,
} from "@/lib/api/types"

import { autoWidgetSpecs, buildAutoWidgets } from "../mocks/db/engine/dashboard"
import { buildInsight } from "../mocks/db/engine/facts"
import { computeKpis } from "../mocks/db/engine/kpis"
import { parseCsv } from "../mocks/db/engine/parse"
import { detectDateColumn, profileTable } from "../mocks/db/engine/profile"
import { applyFilters, runWidget, sortRows } from "../mocks/db/engine/query"
import { samples } from "../mocks/db/samples"

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..")
const samplesDir = join(root, "services/data-py/samples")
const goldenDir = join(root, "services/data-py/tests/golden")
// The landing page renders the real dashboard components from this, so the
// numbers it shows are the engine's, not marketing copy.
const showcaseFile = join(
  root,
  "apps/web/features/marketing/showcase-data.json"
)
// The literal head of the committed CSV, so the landing page's "before" pane
// can never drift from the file it claims to show. A separate file on purpose:
// showcase-data.json is imported by a "use client" component and is therefore
// bundled for every visitor, while the raw rows are read by a server component
// and should never reach the browser.
const showcaseRawFile = join(
  root,
  "apps/web/features/marketing/showcase-raw.json"
)
mkdirSync(samplesDir, { recursive: true })
mkdirSync(goldenDir, { recursive: true })

/** Extra specs and filters per sample, beyond the auto dashboard. */
const extras: Record<
  SampleKey,
  { specs: WidgetSpec[]; filters: Filters; sortColumn: string }
> = {
  orders: {
    specs: [
      {
        chartType: "line",
        title: "Revenue by region",
        x: "order_date",
        y: "revenue",
        aggregation: "sum",
        split: "region",
        timeGrain: "week",
      },
      {
        chartType: "bar",
        title: "Orders by channel",
        x: "channel",
        aggregation: "count",
        split: "customer_type",
      },
      {
        chartType: "bar",
        title: "Avg price",
        x: "category",
        y: "unit_price",
        aggregation: "avg",
      },
      {
        chartType: "bar",
        title: "Max qty",
        x: "region",
        y: "quantity",
        aggregation: "max",
        limit: 3,
      },
      {
        chartType: "donut",
        title: "Distinct orders",
        x: "channel",
        y: "order_id",
        aggregation: "count_distinct",
      },
      {
        chartType: "area",
        title: "Min discount by day",
        x: "order_date",
        y: "discount_pct",
        aggregation: "min",
        timeGrain: "day",
      },
      {
        chartType: "histogram",
        title: "Quantity",
        x: "quantity",
        aggregation: "count",
      },
    ],
    filters: {
      dateRange: { column: "order_date", from: "2025-03-01", to: "2025-05-31" },
      where: [
        { column: "region", op: "in", values: ["North America", "Europe"] },
      ],
    },
    sortColumn: "revenue",
  },
  saas: {
    specs: [
      {
        chartType: "line",
        title: "MRR by plan",
        x: "month",
        y: "mrr",
        aggregation: "sum",
        split: "plan",
        timeGrain: "month",
      },
      {
        chartType: "bar",
        title: "Churn by plan",
        x: "plan",
        y: "churned",
        aggregation: "avg",
      },
      {
        chartType: "bar",
        title: "New accounts by plan",
        x: "is_new",
        aggregation: "count",
        split: "plan",
      },
    ],
    filters: {
      dateRange: { column: "month", from: "2025-01-01" },
      where: [{ column: "plan", op: "in", values: ["Starter"] }],
    },
    sortColumn: "seats",
  },
  weblogs: {
    specs: [
      {
        chartType: "line",
        title: "Latency by hour",
        x: "timestamp",
        y: "latency_ms",
        aggregation: "avg",
        timeGrain: "hour",
      },
      {
        chartType: "bar",
        title: "Status by path",
        x: "path",
        aggregation: "count",
        split: "status",
        limit: 5,
      },
      {
        chartType: "area",
        title: "Requests by device",
        x: "timestamp",
        aggregation: "count",
        split: "device",
        timeGrain: "day",
      },
    ],
    filters: {
      dateRange: { column: "timestamp", from: "2025-09-18", to: "2025-09-18" },
      where: [{ column: "path", op: "in", values: ["/api/checkout"] }],
    },
    sortColumn: "latency_ms",
  },
}

for (const sample of Object.values(samples)) {
  const table = sample.generate()
  const csv = Papa.unparse(table.rows, { newline: "\n" }) + "\n"
  writeFileSync(join(samplesDir, `${sample.key}.csv`), csv)

  const parsed = parseCsv(csv)
  const profiled = profileTable(
    parsed.columns.map((c) => c.name),
    parsed.rows
  )
  const columns: DatasetColumn[] = profiled.map((p, position) => ({
    id: p.name,
    name: p.name,
    originalName: parsed.columns[position]!.originalName,
    position,
    inferredType: p.type,
    overrideType: null,
    profile: p.profile,
  }))
  const rows = parsed.rows
  const dateColumn = detectDateColumn(profiled)
  // Widget ids are "auto:<position>" so Python can use the same references.
  const widgets = buildAutoWidgets("x", columns, dateColumn, "").map((w) => ({
    ...w,
    id: `auto:${w.position}`,
  }))
  const { filters, specs, sortColumn } = extras[sample.key]
  const allSpecs = [...autoWidgetSpecs(columns, dateColumn), ...specs]
  const sorted = sortRows(applyFilters(rows, filters), sortColumn, "desc")

  const golden = {
    key: sample.key,
    rowCount: rows.length,
    // Column ids are random per ingest, so the golden files leave them out.
    columns: columns.map((c) => ({ ...c, id: undefined })),
    dateColumn,
    autoSpecs: autoWidgetSpecs(columns, dateColumn),
    kpis: computeKpis(rows, columns, dateColumn),
    filters,
    kpisFiltered: computeKpis(rows, columns, dateColumn, filters),
    results: allSpecs.map((spec, i) => runWidget(`w${i}`, rows, spec)),
    resultsFiltered: allSpecs.map((spec, i) =>
      runWidget(`w${i}`, applyFilters(rows, filters), spec)
    ),
    specs: allSpecs,
    rowsPage: {
      sort: `${sortColumn}:desc`,
      total: sorted.length,
      rows: sorted.slice(0, 25),
    },
    insight: buildInsight({
      datasetId: "x",
      rows,
      columns,
      dateColumn,
      widgets,
    }),
  }
  writeFileSync(
    join(goldenDir, `${sample.key}.json`),
    JSON.stringify(golden, null, 1) + "\n"
  )

  if (sample.key === "orders") {
    // The headline numbers plus the first auto chart (revenue over time, the
    // one carrying the April drop the Brief talks about).
    const anomalies = golden.insight.anomalies
      .map((anomaly) => {
        const fact = golden.insight.facts.find((f) => f.id === anomaly.factId)
        return fact?.ref?.widgetId === "auto:0" && fact.ref.x !== undefined
          ? { x: fact.ref.x, label: anomaly.description }
          : null
      })
      .filter((a) => a !== null)
    writeFileSync(
      showcaseFile,
      JSON.stringify(
        {
          datasetName: sample.name,
          rowCount: rows.length,
          // The chart on the landing page IS auto:0, so the Brief's fact refs
          // resolve against it: hovering a grounded number highlights the exact
          // point it came from, using the same wiring the product uses.
          widgetId: "auto:0",
          kpis: golden.kpis,
          spec: golden.autoSpecs[0],
          result: golden.results[0],
          anomalies,
          // The auto dashboard's breakdown, carried so the landing page can
          // show a chart with more than one series in it. Every other chart on
          // that page is single-series, so it was all --chart-1 teal and a
          // visitor never saw the categorical palette the product ships.
          // Found by chart type rather than by index: the engine ranks the
          // widgets, so auto:3 is only the donut until a ranking change moves
          // it. Still the same engine output from the same file -- the slice
          // shares are computed, not drawn.
          breakdown: (() => {
            const i = golden.autoSpecs.findIndex((s) => s.chartType === "donut")
            if (i === -1) throw new Error("orders has no donut to showcase")
            return {
              widgetId: `auto:${i}`,
              spec: golden.autoSpecs[i],
              result: golden.results[i],
            }
          })(),
          // The real generated brief. The landing page had been illustrating
          // "every number is computed, never written by the AI" with numbers a
          // human typed; this is the engine's own output.
          insight: golden.insight,
        },
        null,
        2
      ) + "\n"
    )

    writeFileSync(
      showcaseRawFile,
      JSON.stringify(
        {
          fileName: `${sample.key}.csv`,
          bytes: csv.length,
          rowCount: rows.length,
          // The file's own header spelling, not the normalised column ids.
          columns: parsed.columns.map((c) => c.originalName),
          // The HEAD of the file, deliberately -- NOT golden.rowsPage.rows,
          // which is filtered and sorted by revenue desc. Showing the top rows
          // on a slide about what the raw file looks like would misreport it.
          rows: rows.slice(0, 8),
        },
        null,
        2
      ) + "\n"
    )
  }
  console.log(
    `${sample.key}: ${rows.length} rows, ${csv.length} bytes, ${columns.length} columns`
  )
}
