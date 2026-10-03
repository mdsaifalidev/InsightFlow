// Facts engine for the AI Brief (ADR-010): all statistics are computed here;
// the narrative only references them by id. Mirrors the Python/Polars version.

import type {
  Aggregation,
  Anomaly,
  DatasetColumn,
  Fact,
  Insight,
  TimeGrain,
  ValueFormat,
  Widget,
} from "@/lib/api/types"

import type { Row } from "../types"
import {
  columnsOfType,
  defaultAggregation,
  entityLabel,
  flagColumns,
  flagNoun,
  measureLabel,
  phrase,
  rankedMeasures,
  valueFormat,
} from "./measures"
import { keepGrounded } from "./narrative"
import { aggregate } from "./query"
import { anomalyGrain, bucket, inPeriod, storyGrain } from "./time"

type Point = { key: string; value: number; rows: Row[] }

/** Robust z-score threshold for anomalies. */
const Z_THRESHOLD = 3.5
/** An anomaly this strong leads the summary over a modest trend change. */
const Z_HEADLINE = 6
const round = (value: number, digits = 4) =>
  Math.round(value * 10 ** digits) / 10 ** digits

function seriesBy(
  rows: Row[],
  dateColumn: string,
  grain: TimeGrain,
  column: string | undefined,
  aggregation: Aggregation
): Point[] {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const v = row[dateColumn]
    if (typeof v !== "string") continue
    const key = bucket(v, grain)
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, list]) => ({
      key,
      rows: list,
      value: aggregate(list, column, aggregation),
    }))
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Robust z-scores (median / MAD), so a single spike can't hide itself. */
function robustZ(values: number[]) {
  const med = median(values)
  const mad = median(values.map((v) => Math.abs(v - med)))
  if (mad === 0) {
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const sd =
      Math.sqrt(
        values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
      ) || 1
    return values.map((v) => (v - mean) / sd)
  }
  return values.map((v) => (v - med) / (1.4826 * mad))
}

/**
 * The category that explains most of a change between two sets of rows,
 * measured on the underlying total (so small, noisy groups can't win).
 */
function findDriver(
  now: Row[],
  before: Row[],
  column: string,
  measure: string | undefined,
  aggregation: Aggregation,
  sign: number
) {
  const totalOf = (rows: Row[]) =>
    aggregate(rows, measure, aggregation === "avg" ? "sum" : aggregation)
  const totalDelta = totalOf(now) - totalOf(before)
  if (!totalDelta) return null
  const categories = new Set(
    [...now, ...before]
      .map((r) => r[column])
      .filter((v) => v !== null)
      .map(String)
  )
  let best: { category: string; share: number; change: number } | null = null
  for (const category of categories) {
    const inNow = now.filter((r) => String(r[column]) === category)
    const inBefore = before.filter((r) => String(r[column]) === category)
    const share = (totalOf(inNow) - totalOf(inBefore)) / totalDelta
    const valueBefore = aggregate(inBefore, measure, aggregation)
    if (!valueBefore) continue
    const change =
      (aggregate(inNow, measure, aggregation) - valueBefore) /
      Math.abs(valueBefore)
    if (Math.sign(change) !== sign) continue
    if (!best || share > best.share) best = { category, share, change }
  }
  return best && best.share >= 0.3 ? best : null
}

type Context = {
  datasetId: string
  rows: Row[]
  columns: DatasetColumn[]
  dateColumn: string | null
  widgets: Widget[]
}

type Target = {
  column: string | undefined
  aggregation: Aggregation
  label: string
  format: ValueFormat
  widget?: Widget
}

export function buildInsight({
  datasetId,
  rows,
  columns,
  dateColumn,
  widgets,
}: Context): Omit<Insight, "id" | "createdAt"> {
  const facts: Fact[] = []
  const anomalies: Anomaly[] = []
  const lead: string[] = []
  const summary: string[] = []
  const findings: string[] = []
  const questions: string[] = []
  const add = (fact: Omit<Fact, "id">) => {
    const id = `f${facts.length + 1}`
    facts.push({ id, ...fact })
    return id
  }

  const measure = rankedMeasures(columns)[0]
  const aggregation = measure ? defaultAggregation(measure.name) : "count"
  const label = measureLabel(measure?.name, aggregation)
  const lower = label.charAt(0).toLowerCase() + label.slice(1)
  const format: ValueFormat = valueFormat(measure?.name ?? "", aggregation)
  const categoryColumns = [
    ...widgets
      .filter((w) => w.kind === "auto" && w.spec.chartType === "bar")
      .map((w) => w.spec.x),
    ...columnsOfType(columns, "categorical").map((c) => c.name),
  ].filter((name, i, all) => all.indexOf(name) === i)
  const barFor = (column: string) =>
    widgets.find(
      (w) =>
        w.kind === "auto" && w.spec.chartType === "bar" && w.spec.x === column
    )
  const idColumn = columnsOfType(columns, "id")[0]

  const totalId = add({
    kind: "total",
    label,
    value: aggregate(rows, measure?.name, aggregation),
    format,
  })

  const date = dateColumn
    ? columns.find((c) => c.name === dateColumn)
    : undefined
  const range = date?.profile.datetime
  if (date && range) {
    const grain = storyGrain(range.min, range.max, range.grain)
    const line = widgets.find(
      (w) =>
        w.kind === "auto" &&
        w.spec.x === date.name &&
        w.spec.y === measure?.name &&
        w.spec.timeGrain === grain
    )
    const series = seriesBy(rows, date.name, grain, measure?.name, aggregation)

    // 1. The most meaningful period-over-period change. A rebound that just
    //    undoes the previous period's move scores lower than the move itself.
    let best: { i: number; change: number; score: number } | null = null
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1]!.value
      if (!prev) continue
      const change = (series[i]!.value - prev) / Math.abs(prev)
      // A rebound returns the series to where it was two periods earlier.
      const twoBack = i > 1 ? series[i - 2]!.value : 0
      const reverts =
        !!twoBack &&
        Math.abs(series[i]!.value - twoBack) / Math.abs(twoBack) <= 0.1
      // Declines weigh a little more: they're what people need to act on.
      const score =
        Math.abs(change) * (reverts ? 0.5 : 1) * (change < 0 ? 1.25 : 1)
      if (!best || score > best.score) best = { i, change, score }
    }

    if (best && Math.abs(best.change) >= 0.05) {
      const current = series[best.i]!
      const previous = series[best.i - 1]!
      const when = inPeriod(current.key, grain)
      const direction = best.change < 0 ? "fell" : "rose"
      const changeId = add({
        kind: "change",
        label: `${label} change ${when}`,
        value: round(best.change),
        format: "change",
        ref: line ? { widgetId: line.id, x: current.key } : undefined,
      })

      let sentence = `${label} ${direction} {{${changeId}}} ${when}`
      const drivers = categoryColumns
        .map((column) => ({
          column,
          driver: findDriver(
            current.rows,
            previous.rows,
            column,
            measure?.name,
            aggregation,
            Math.sign(best.change)
          ),
        }))
        .filter((d) => d.driver)
        .sort((a, b) => b.driver!.share - a.driver!.share)
      const top = drivers[0]
      if (top?.driver) {
        const { category, change, share } = top.driver
        const bar = barFor(top.column)
        const driverId = add({
          kind: "contributor",
          label: `${category} ${lower} change ${when}`,
          value: round(change),
          format: "change",
          ref: bar ? { widgetId: bar.id, x: category } : undefined,
        })
        if (aggregation === "avg") {
          sentence += `, led by ${category} (${phrase(top.column)}), where it moved {{${driverId}}}.`
        } else {
          const shareId = add({
            kind: "contributor",
            label: `${category} share of the ${direction === "fell" ? "drop" : "increase"}`,
            value: round(Math.min(share, 1) * 100, 1),
            format: "percent",
          })
          sentence += `, driven mostly by ${category} (${phrase(top.column)}), which moved {{${driverId}}} and accounts for {{${shareId}}} of the change.`
        }
        questions.push(`What changed for ${category} ${when}?`)
      } else {
        sentence += "."
      }
      summary.push(sentence)
      questions.push(
        `Is the ${direction === "fell" ? "drop" : "rise"} ${when} a one-off or the start of a trend?`
      )
    }

    // 2. Anomalies on the measure and on tracked flags (churned, errors...).
    const targets: Target[] = [
      { column: measure?.name, aggregation, label, format, widget: line },
    ]
    const flag = flagColumns(columns)[0]
    if (flag) {
      targets.push({
        column: flag.name,
        aggregation: "sum",
        label: idColumn
          ? `${flagNoun(flag.name) === "Churn" ? "Churned" : flagNoun(flag.name)} ${entityLabel(idColumn.name).toLowerCase()}`
          : flagNoun(flag.name),
        format: "number",
        widget: widgets.find(
          (w) => w.kind === "auto" && w.spec.y === flag.name
        ),
      })
    }
    const fine = anomalyGrain(grain, range.min, range.max)
    const found: {
      z: number
      target: Target
      point: Point
      previous?: Point
    }[] = []
    for (const target of targets) {
      const points = seriesBy(
        rows,
        date.name,
        fine,
        target.column,
        target.aggregation
      )
      if (points.length < 8) continue
      // Averages over a handful of rows (quiet hours) are too noisy to flag.
      const minRows =
        target.aggregation === "avg"
          ? median(points.map((p) => p.rows.length)) * 0.8
          : 0
      const z = robustZ(points.map((p) => p.value))
      points.forEach((point, i) => {
        if (Math.abs(z[i]!) >= Z_THRESHOLD && point.rows.length >= minRows) {
          found.push({ z: z[i]!, target, point, previous: points[i - 1] })
        }
      })
    }
    found.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))

    const seen = new Set<string>()
    for (const { z, target, point, previous } of found) {
      // One anomaly per chart point keeps the Brief readable.
      const chartX = bucket(point.key, target.widget?.spec.timeGrain ?? grain)
      const key = `${target.label}:${chartX}`
      if (seen.has(key) || anomalies.length >= 3) continue
      seen.add(key)
      const when = inPeriod(point.key, fine)
      const high = z > 0
      const factId = add({
        kind: "anomaly",
        label: `${target.label} ${when}`,
        value: round(point.value, 2),
        format: target.format,
        ref: target.widget
          ? { widgetId: target.widget.id, x: chartX }
          : undefined,
      })
      anomalies.push({
        id: `a${anomalies.length + 1}`,
        factId,
        column: target.column ?? "rows",
        at: point.key,
        zScore: round(z, 1),
        direction: high ? "spike" : "drop",
        description: `Unusually ${high ? "high" : "low"} ${target.label.charAt(0).toLowerCase()}${target.label.slice(1)} ${when}.`,
      })

      let sentence = `${target.label} ${high ? "spiked" : "dropped"} to {{${factId}}} ${when}, far ${high ? "above" : "below"} the usual level`
      if (previous && Math.abs(z) >= Z_HEADLINE) {
        const driver = categoryColumns
          .map((column) => ({
            column,
            driver: findDriver(
              point.rows,
              previous.rows,
              column,
              target.column,
              target.aggregation,
              high ? 1 : -1
            ),
          }))
          .filter((d) => d.driver)
          .sort((a, b) => b.driver!.share - a.driver!.share)[0]
        if (driver?.driver) {
          const shareId = add({
            kind: "contributor",
            label: `${driver.driver.category} share of the ${high ? "spike" : "drop"} ${when}`,
            value: round(Math.min(driver.driver.share, 1) * 100, 1),
            format: "percent",
            ref: barFor(driver.column)
              ? {
                  widgetId: barFor(driver.column)!.id,
                  x: driver.driver.category,
                }
              : undefined,
          })
          sentence += `, with ${driver.driver.category} (${phrase(driver.column)}) accounting for {{${shareId}}} of the jump`
          questions.push(`What happened to ${driver.driver.category} ${when}?`)
        }
        lead.push(`${sentence}.`)
      } else {
        findings.push(`${sentence}.`)
      }
    }
  }

  // 3. Composition: the largest category's share of the measure.
  const firstBar = widgets.find(
    (w) => w.kind === "auto" && w.spec.chartType === "bar"
  )
  if (firstBar && aggregation === "sum" && measure) {
    const total = aggregate(rows, measure.name, "sum")
    const byCategory = new Map<string, number>()
    for (const row of rows) {
      const key = row[firstBar.spec.x]
      const v = row[measure.name]
      if (key === null || typeof v !== "number") continue
      byCategory.set(String(key), (byCategory.get(String(key)) ?? 0) + v)
    }
    const [topCategory, topValue] =
      [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0] ?? []
    if (topCategory && total) {
      const shareId = add({
        kind: "total",
        label: `${topCategory} share of ${phrase(measure.name)}`,
        value: round((topValue! / total) * 100, 1),
        format: "percent",
        ref: { widgetId: firstBar.id, x: topCategory },
      })
      findings.push(
        `${topCategory} is the largest ${phrase(firstBar.spec.x)}, with {{${shareId}}} of ${phrase(measure.name)}.`
      )
      questions.push(
        `How has the ${phrase(firstBar.spec.x)} mix shifted over time?`
      )
    }
  }

  summary.push(`Across the whole dataset, ${lower} is {{${totalId}}}.`)

  return {
    datasetId,
    summary: keepGrounded([...lead, ...summary], facts).join(" "),
    findings: keepGrounded(findings, facts).slice(0, 5),
    nextQuestions: [...new Set(questions)].slice(0, 3),
    facts,
    anomalies,
    provider: "mock",
    model: "template-v1",
  }
}
