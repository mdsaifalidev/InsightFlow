// Glue between the analytics engine and the mock store: builds dashboards and
// briefs during ingest (pipeline hooks) or lazily for older datasets.

import type { DatasetColumn, Insight, Widget } from "@/lib/api/types"

import { buildAutoWidgets } from "./engine/dashboard"
import { buildInsight } from "./engine/facts"
import { effectiveType } from "./engine/measures"
import { getTypedRows } from "./engine/typed-rows"
import { pipelineHooks } from "./jobs"
import { db, mutate, newId, nowIso, type StoredDataset } from "./store"

export function datasetColumns(dataset: StoredDataset): DatasetColumn[] {
  return db().columns[dataset.id] ?? []
}

/** The first column the user treats as a date (respects type overrides). */
export function dateColumnOf(dataset: StoredDataset) {
  return (
    datasetColumns(dataset).find((c) => effectiveType(c) === "datetime")
      ?.name ?? null
  )
}

export function widgetsOf(datasetId: string): Widget[] {
  return db()
    .widgets.filter((w) => w.datasetId === datasetId)
    .sort((a, b) => a.position - b.position)
}

async function buildDashboard(dataset: StoredDataset) {
  const widgets = buildAutoWidgets(
    dataset.id,
    datasetColumns(dataset),
    dateColumnOf(dataset),
    nowIso()
  )
  mutate((s) => {
    const custom = s.widgets.filter(
      (w) => w.datasetId === dataset.id && w.kind === "custom"
    )
    s.widgets = s.widgets.filter((w) => w.datasetId !== dataset.id)
    // Custom charts keep their place after the auto ones.
    custom.forEach((w, i) => (w.position = widgets.length + i))
    s.widgets.push(...widgets, ...custom)
    const stored = s.datasets.find((d) => d.id === dataset.id)
    if (stored) stored.dashboardBuilt = true
  })
}

async function generateInsight(dataset: StoredDataset): Promise<Insight> {
  const rows = await getTypedRows(dataset)
  const insight: Insight = {
    id: newId(),
    createdAt: nowIso(),
    ...buildInsight({
      datasetId: dataset.id,
      rows,
      columns: datasetColumns(dataset),
      dateColumn: dateColumnOf(dataset),
      widgets: widgetsOf(dataset.id),
    }),
  }
  mutate((s) => {
    // Keep only the latest brief per dataset.
    s.insights = s.insights.filter((i) => i.datasetId !== dataset.id)
    s.insights.push(insight)
  })
  return insight
}

export async function ensureDashboard(dataset: StoredDataset) {
  if (!dataset.dashboardBuilt) await buildDashboard(dataset)
  return widgetsOf(dataset.id)
}

export async function ensureInsight(dataset: StoredDataset) {
  await ensureDashboard(dataset)
  return (
    db().insights.find((i) => i.datasetId === dataset.id) ??
    generateInsight(dataset)
  )
}

/** After a column type override: fresh auto charts and brief. */
export async function rebuildAnalytics(dataset: StoredDataset) {
  await buildDashboard(dataset)
  await generateInsight(dataset)
}

pipelineHooks.buildDashboard = buildDashboard
pipelineHooks.generateInsight = async (dataset) => {
  await generateInsight(dataset)
}
