"use client"

import type { Insight, Kpi, WidgetResult, WidgetSpec } from "@/lib/api/types"
import { HighlightProvider } from "@/features/dashboard/highlight"
import { KpiStrip } from "@/features/dashboard/components/kpi-strip"
import { WidgetChart } from "@/features/dashboard/components/widget-chart"
import { BriefBody } from "@/features/insights/components/brief"

import showcase from "../showcase-data.json"

import { Band } from "./band"
import { DrawIn } from "./draw-in"
import { Reveal } from "./reveal"

// Not a screenshot: the components the app itself renders, fed the engine's
// output for the sample orders file (apps/web/scripts/export-fixtures.ts).
const kpis = showcase.kpis as Kpi[]
const spec = showcase.spec as WidgetSpec
const result = showcase.result as WidgetResult
// The real generated brief for this file, not an illustration of one. Its fact
// refs point at showcase.widgetId, which is the chart above.
const insight = showcase.insight as unknown as Insight
// The auto dashboard's breakdown of the same file. It is here to carry the
// categorical palette: every other chart on this page is single-series, so the
// whole landing page was --chart-1 teal and a visitor never saw the six hues
// the product actually ships.
const breakdownSpec = showcase.breakdown.spec as WidgetSpec
const breakdownResult = showcase.breakdown.result as WidgetResult

export function LiveShowcase() {
  return (
    <Band
      tone="panel"
      // Not flushTop: that continues a band of the SAME surface. This follows
      // the ink hero, so with no top padding its heading sat flat against the
      // tone change.
      rhythm="normal"
      width="wide"
      labelledBy="live-heading"
      innerClassName="flex flex-col gap-8"
    >
      {/* fade, not rise: the chart below carries a hover target, and a section
          that moves relocates it between hit-test and click. */}
      <Reveal fade className="flex max-w-2xl flex-col gap-4">
        <h2
          id="live-heading"
          className="font-serif text-display-lg text-balance"
        >
          This is the real thing, not a picture of it
        </h2>
        <p className="text-subhead text-muted-foreground">
          Not a screenshot: these are the components the app itself renders, fed
          what the engine computed from {showcase.datasetName} —{" "}
          {showcase.rowCount.toLocaleString("en-US")} rows of the same file you
          just saw.
        </p>
      </Reveal>

      {/* The provider is what lets a number in the Brief band light up the
          point it came from on this chart. Same wiring the product uses. */}
      <HighlightProvider>
        <div className="flex min-w-0 flex-col gap-4">
          <KpiStrip kpis={kpis} loading={false} animate />
          {/* Lead chart wide, breakdown beside it -- the same shape the real
              auto dashboard lays out, and it keeps the trend directly above
              the Brief that cites it. Charts sit on --card, never on the band
              background: the palette was validated against --surface-raised. */}
          <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5 shadow-e1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-card-title">{spec.title}</h3>
                {/* Promoted out of a muted paragraph: it points at the thing it
                    describes instead of sitting four lines above it. */}
                <p className="flex items-center gap-2 text-body-sm">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-signal"
                  />
                  The marked point is an anomaly it found on its own.
                </p>
              </div>
              <DrawIn>
                <WidgetChart
                  widgetId={showcase.widgetId}
                  spec={spec}
                  result={result}
                  anomalies={showcase.anomalies}
                />
              </DrawIn>
            </div>

            {/* No DrawIn: that traces a line path, and this has none. */}
            <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-5 shadow-e1">
              <h3 className="text-card-title">{breakdownSpec.title}</h3>
              <WidgetChart
                widgetId={showcase.breakdown.widgetId}
                spec={breakdownSpec}
                result={breakdownResult}
              />
            </div>
          </div>

          {/* The brief sits directly under the chart it cites, because the
              interlink is the point: hovering a grounded number lights up the
              exact point it was computed from. Separating them into two bands
              would mean hovering a number to highlight something off-screen. */}
          <div className="flex min-w-0 flex-col gap-5 rounded-xl border bg-card p-5 shadow-e1 sm:p-6">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-card-title">Brief</h3>
              <p className="text-caption text-muted-foreground">
                Every highlighted number is computed from your data. Hover one
                to find it on the chart above.
              </p>
            </div>
            <BriefBody insight={insight} filtersActive={false} />
          </div>
        </div>
      </HighlightProvider>
    </Band>
  )
}
