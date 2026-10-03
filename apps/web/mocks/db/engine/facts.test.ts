// @vitest-environment node
import { describe, expect, it } from "vitest"

import type { DatasetColumn, Fact, Insight } from "@/lib/api/types"

import { samples } from "../samples"
import type { SampleKey } from "@/lib/api/types"
import { buildAutoWidgets } from "./dashboard"
import { buildInsight } from "./facts"
import { ungroundedNumbers, validateNarrative } from "./narrative"
import { detectDateColumn, profileTable } from "./profile"

function analyze(key: SampleKey) {
  const table = samples[key].generate()
  const profiled = profileTable(
    table.columns.map((c) => c.name),
    table.rows
  )
  const columns: DatasetColumn[] = profiled.map((p, position) => ({
    id: p.name,
    name: p.name,
    originalName: p.name,
    position,
    inferredType: p.type,
    overrideType: null,
    profile: p.profile,
  }))
  const dateColumn = detectDateColumn(profiled)
  const widgets = buildAutoWidgets(
    key,
    columns,
    dateColumn,
    "2026-01-01T00:00:00Z"
  )
  const insight = buildInsight({
    datasetId: key,
    rows: table.rows,
    columns,
    dateColumn,
    widgets,
  })
  return { widgets, insight }
}

/** Renders {{factId}} tokens with raw values, for readable assertions. */
function render(text: string, insight: Pick<Insight, "facts">) {
  return text.replace(/\{\{(\w+)\}\}/g, (_, id: string) => {
    const fact = insight.facts.find((f) => f.id === id)!
    return `[${fact.label}=${fact.value}]`
  })
}

describe("facts engine on the sample datasets", () => {
  it("orders: finds the April drop driven by Electronics and the Black Friday spike", () => {
    const { insight } = analyze("orders")
    const summary = render(insight.summary, insight)
    expect(summary).toMatch(
      /fell \[Total revenue change in April 2025=-0\.\d+\] in April 2025/
    )
    expect(summary).toMatch(/driven mostly by Electronics \(category\)/)
    expect(insight.anomalies.map((a) => a.at)).toContain("2025-11-28")

    const change = insight.facts.find((f) => f.kind === "change")!
    expect(change.value).toBeLessThan(-0.15)
    expect(change.ref).toMatchObject({ x: "2025-04-01" })
  })

  it("saas: leads with the June 2025 churn spike from the Starter plan", () => {
    const { insight } = analyze("saas")
    const summary = render(insight.summary, insight)
    expect(summary.startsWith("Churned accounts spiked")).toBe(true)
    expect(summary).toMatch(/in June 2025.*Starter \(plan\)/)
  })

  it("weblogs: pins the Sep 18 latency spike on /api/checkout", () => {
    const { insight } = analyze("weblogs")
    expect(insight.anomalies[0]).toMatchObject({
      at: "2025-09-18T16:00",
      direction: "spike",
    })
    expect(render(insight.summary, insight)).toMatch(/\/api\/checkout \(path\)/)
  })

  it("only ever cites numbers through fact references", () => {
    for (const key of ["orders", "saas", "weblogs"] as const) {
      const { insight } = analyze(key)
      for (const text of [insight.summary, ...insight.findings]) {
        expect(ungroundedNumbers(text, insight.facts)).toEqual([])
      }
    }
  })

  it("links facts to charts that exist", () => {
    const { insight, widgets } = analyze("orders")
    const ids = new Set(widgets.map((w) => w.id))
    for (const fact of insight.facts.filter((f) => f.ref)) {
      expect(ids.has(fact.ref!.widgetId)).toBe(true)
    }
  })
})

describe("validateNarrative", () => {
  const facts: Fact[] = [
    {
      id: "f1",
      kind: "change",
      label: "Revenue change",
      value: -0.18,
      format: "change",
    },
  ]

  it("accepts fact references and dates", () => {
    expect(
      validateNarrative(
        "Revenue fell {{f1}} in April 2025, then again on Sep 18 at 14:00.",
        facts
      )
    ).toBe(true)
  })

  it("rejects numbers the facts don't back", () => {
    expect(ungroundedNumbers("Revenue fell 18% in April.", facts)).toEqual([
      "18%",
    ])
    expect(ungroundedNumbers("Revenue was $1,200 higher.", facts)).toEqual([
      "$1,200",
    ])
    expect(ungroundedNumbers("Revenue fell {{f9}}.", facts)).toEqual(["{{f9}}"])
  })
})
