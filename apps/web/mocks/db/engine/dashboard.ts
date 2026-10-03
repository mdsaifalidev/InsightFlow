// Auto-generated dashboard (PRD F5): pick charts from column profiles.

import type { DatasetColumn, Widget, WidgetSpec } from "@/lib/api/types"

import {
  columnsOfType,
  defaultAggregation,
  flagColumns,
  flagNoun,
  measureLabel,
  phrase,
  rankedMeasures,
} from "./measures"
import { storyGrain } from "./time"

const MAX_WIDGETS = 8

/**
 * The leading category's share that makes the best story: one clear winner,
 * but a real mix behind it. Below it a column is a flat wall of equal bars,
 * far above it a single bar with rounding dust beside it.
 */
const IDEAL_TOP_SHARE = 0.6

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/**
 * How interesting a categorical column is as a bar chart (PRD F5). The engine
 * only ever sees column profiles, never rows, so the score uses what a profile
 * has: the shape of the top values, the number of bars, and how full the
 * column is. `top` holds the 10 most common values, so for a wider column the
 * share is measured within those ten — well defined, and all the engine knows.
 *
 * Keep this identical to category_score() in the Python engine: same terms in
 * the same order, then js_round to 6 places, so both sort the same way.
 */
export function barScore(column: DatasetColumn): number {
  const top = column.profile.categorical?.top ?? []
  const covered = top.reduce((sum, t) => sum + t.count, 0)
  if (!covered || !top[0]) return 0

  const share = top[0].count / covered
  const balance =
    share <= IDEAL_TOP_SHARE
      ? share / IDEAL_TOP_SHARE
      : Math.max(0, 1 - (share - IDEAL_TOP_SHARE) / (1 - IDEAL_TOP_SHARE))

  const distinct = column.profile.distinctCount
  const readability =
    distinct >= 3 && distinct <= 8
      ? 1
      : distinct === 2 || (distinct >= 9 && distinct <= 12)
        ? 0.5
        : 0.25

  const completeness = Math.max(0, Math.min(1, 1 - column.profile.nullPct))
  return round6(0.6 * balance + 0.25 * readability + 0.15 * completeness)
}

/** Categories worth a bar chart: 2–20 values, preferring 3–8. */
function chartableCategories(columns: DatasetColumn[]) {
  const preferred = (c: DatasetColumn) =>
    c.profile.distinctCount >= 3 && c.profile.distinctCount <= 8 ? 0 : 1
  return columnsOfType(columns, "categorical")
    .filter(
      (c) => c.profile.distinctCount >= 2 && c.profile.distinctCount <= 20
    )
    .sort((a, b) => preferred(a) - preferred(b) || a.position - b.position)
}

export function autoWidgetSpecs(
  columns: DatasetColumn[],
  dateColumn: string | null
): WidgetSpec[] {
  const specs: WidgetSpec[] = []
  const measure = rankedMeasures(columns)[0]
  const aggregation = measure ? defaultAggregation(measure.name) : "count"
  const metric = measureLabel(measure?.name, aggregation)
  const date = dateColumn
    ? columns.find((c) => c.name === dateColumn)
    : undefined
  const range = date?.profile.datetime

  if (date && range) {
    const grain = storyGrain(range.min, range.max, range.grain)
    specs.push({
      chartType: "line",
      title: `${metric} by ${grain}`,
      x: date.name,
      y: measure?.name,
      aggregation,
      timeGrain: grain,
    })
    if (aggregation === "avg") {
      specs.push({
        chartType: "area",
        title: `Rows by ${grain}`,
        x: date.name,
        aggregation: "count",
        timeGrain: grain,
      })
    }
    const flag = flagColumns(columns)[0]
    if (flag) {
      specs.push({
        chartType: "line",
        title: `${flagNoun(flag.name)} by ${grain}`,
        x: date.name,
        y: flag.name,
        aggregation: "sum",
        timeGrain: grain,
      })
    }
  }

  const categories = chartableCategories(columns).filter(
    (c) => !flagColumns(columns).some((f) => f.name === c.name)
  )
  // Part-to-whole only works for 3–6 segments (a 2-slice pie is a stat tile);
  // pick the donut first so it doesn't duplicate a bar chart.
  const donut = categories
    .slice(2)
    .find((c) => c.profile.distinctCount >= 3 && c.profile.distinctCount <= 6)
  // Which categories get charted stays position-based; which one leads is
  // ranked, because the first bar is also what the Brief narrates (facts.ts).
  const bars = categories
    .filter((c) => c !== donut)
    .slice(0, 3 - (donut ? 1 : 0))
    .sort((a, b) => barScore(b) - barScore(a) || a.position - b.position)
  for (const category of bars) {
    specs.push({
      chartType: "bar",
      title: `${metric} by ${phrase(category.name)}`,
      x: category.name,
      y: measure?.name,
      aggregation,
      limit: 8,
    })
  }

  if (donut) {
    const share = aggregation === "sum" && measure
    specs.push({
      chartType: "donut",
      title: share
        ? `Share of ${phrase(measure.name)} by ${phrase(donut.name)}`
        : `Rows by ${phrase(donut.name)}`,
      x: donut.name,
      y: share ? measure.name : undefined,
      aggregation: share ? "sum" : "count",
      limit: 6,
    })
  }

  if (measure) {
    specs.push({
      chartType: "histogram",
      title: `Distribution of ${phrase(measure.name)}`,
      x: measure.name,
      aggregation: "count",
    })
  }

  return specs.slice(0, MAX_WIDGETS)
}

export function buildAutoWidgets(
  datasetId: string,
  columns: DatasetColumn[],
  dateColumn: string | null,
  createdAt: string
): Widget[] {
  return autoWidgetSpecs(columns, dateColumn).map((spec, position) => ({
    id: `${datasetId}:auto:${position}`,
    datasetId,
    kind: "auto",
    spec,
    position,
    createdAt,
  }))
}
