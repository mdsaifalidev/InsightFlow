"use client"

import * as React from "react"
import { RefreshCwIcon } from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import { ApiError } from "@/lib/api-client"
import type { Fact, Insight } from "@/lib/api/types"
import { formatRelative, formatValue } from "@/lib/format"
import { useJobState } from "@/features/datasets/job-tracker"
import { useHighlight } from "@/features/dashboard/highlight"

import { useInsight, useRegenerateInsight } from "../api"
import { FactMark } from "./fact-mark"

/** Renders "{{f1}}" tokens as live, chart-linked numbers. */
function Narrative({
  text,
  facts,
}: {
  text: string
  facts: Map<string, Fact>
}) {
  const { highlight, setHighlight } = useHighlight()
  const parts = text.split(/(\{\{\w+\}\})/g)

  return (
    <>
      {parts.map((part, i) => {
        const id = /^\{\{(\w+)\}\}$/.exec(part)?.[1]
        const fact = id ? facts.get(id) : undefined
        if (!id) return <React.Fragment key={i}>{part}</React.Fragment>
        if (!fact) return null
        const active =
          !!fact.ref &&
          highlight?.widgetId === fact.ref.widgetId &&
          highlight.x === fact.ref.x
        return (
          <FactMark
            key={i}
            label={`${fact.label}: ${formatValue(fact.value, fact.format)}`}
            active={active}
            onActiveChange={(on) =>
              setHighlight(
                on && fact.ref
                  ? { widgetId: fact.ref.widgetId, x: fact.ref.x }
                  : null
              )
            }
          >
            {formatValue(fact.value, fact.format, {
              compact: fact.format === "currency",
            })}
          </FactMark>
        )
      })}
    </>
  )
}

export function Brief({
  datasetId,
  datasetName,
  filtersActive,
}: {
  datasetId: string
  datasetName: string
  filtersActive: boolean
}) {
  const insight = useInsight(datasetId)
  const regenerate = useRegenerateInsight(datasetId, datasetName)
  const job = useJobState(regenerate.data?.jobId)
  const rewriting = regenerate.isPending || job?.status === "running"

  const onRegenerate = () =>
    regenerate.mutate(undefined, {
      onError: (error) =>
        toast.error(
          error instanceof ApiError && error.status === 429
            ? "Regeneration limit reached"
            : "Couldn't regenerate the brief",
          { description: error.message }
        ),
    })

  return (
    <section
      aria-labelledby="brief-heading"
      className="flex flex-col gap-5 rounded-lg bg-card p-5 shadow-e1 ring-1 ring-border-soft sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="brief-heading" className="text-section">
            Brief
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Every highlighted number is computed from your data. Hover one to
            find it on a chart.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRegenerate}
          disabled={rewriting || !insight.data}
        >
          {rewriting ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <RefreshCwIcon data-icon="inline-start" />
          )}
          {rewriting ? "Rewriting" : "Regenerate"}
        </Button>
      </div>

      {insight.isPending ? (
        <div className="flex flex-col gap-2" aria-label="Writing the brief">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-11/12" />
          <Skeleton className="h-6 w-3/5" />
        </div>
      ) : insight.isError ? (
        <Alert variant="destructive">
          <AlertTitle>The brief couldn&apos;t be loaded</AlertTitle>
          <AlertDescription>{insight.error.message}</AlertDescription>
        </Alert>
      ) : (
        <BriefBody
          insight={insight.data}
          filtersActive={filtersActive}
          layout="split"
        />
      )}
    </section>
  )
}

/**
 * The brief itself, given an Insight. Exported because the landing page renders
 * the real thing from the engine's committed output (features/marketing) rather
 * than a hand-drawn imitation of it -- a page claiming every number is computed
 * should not illustrate the claim with numbers a human typed.
 */
export function BriefBody({
  insight,
  filtersActive,
  layout = "stacked",
}: {
  insight: Insight
  filtersActive: boolean
  /**
   * `stacked` runs the standfirst full width with its supporting material
   * beneath — right where the card is narrow, as on the landing page.
   *
   * `split` puts the supporting material in a sidebar beside the prose, which
   * is what a wide card wants: it keeps the serif to a readable measure
   * instead of letting it run to 72rem, and stops the findings, questions and
   * anomaly chips stretching across a width they do not need.
   */
  layout?: "stacked" | "split"
}) {
  const split = layout === "split"
  const facts = React.useMemo(
    () => new Map(insight.facts.map((f) => [f.id, f])),
    [insight.facts]
  )
  const { setHighlight } = useHighlight()

  const supporting = (
    <>
      {insight.findings.length || insight.anomalies.length ? (
        <div
          className={cn(
            "grid gap-5",
            // In the sidebar there is no room for two columns.
            split
              ? "grid-cols-1"
              : "md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
          )}
        >
          {insight.findings.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-section">Also worth knowing</h3>
              <ul className="flex flex-col gap-2 text-sm leading-relaxed text-pretty">
                {insight.findings.map((finding, i) => (
                  <li key={i} className="flex gap-2">
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                      aria-hidden
                    />
                    <span>
                      <Narrative text={finding} facts={facts} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {insight.nextQuestions.length ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-section">Questions to explore</h3>
              <ul className="flex flex-col gap-1.5 text-sm leading-relaxed text-muted-foreground">
                {insight.nextQuestions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {insight.anomalies.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-section">Unusual points</h3>
          <ul className="flex flex-wrap gap-2">
            {insight.anomalies.map((anomaly) => {
              const fact = facts.get(anomaly.factId)
              return (
                <li key={anomaly.id}>
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded-md border border-border-soft bg-muted/40 px-2.5 py-1.5 text-left text-[13px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    onPointerEnter={() =>
                      fact?.ref &&
                      setHighlight({
                        widgetId: fact.ref.widgetId,
                        x: fact.ref.x,
                      })
                    }
                    onPointerLeave={() => setHighlight(null)}
                    onFocus={() =>
                      fact?.ref &&
                      setHighlight({
                        widgetId: fact.ref.widgetId,
                        x: fact.ref.x,
                      })
                    }
                    onBlur={() => setHighlight(null)}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-signal"
                      aria-hidden
                    />
                    {anomaly.description}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Written by {insight.provider}/{insight.model} from{" "}
        {insight.facts.length} computed facts
        {/* A fixture has no ingest time, and "just now" would be a lie on a
            page that is served from a build. */}
        {insight.createdAt ? `, ${formatRelative(insight.createdAt)}` : ""}.
        {filtersActive
          ? " The brief covers the whole dataset; filters apply to the KPIs and charts."
          : ""}
      </p>
    </>
  )

  const standfirst =
    (
      /*
       * A standfirst, not body copy -- the one thing on this page no competing
       * product has, so it gets the serif and a measure of its own. It reads
       * as an analyst's note, not a pull-quote: display-md (2.25rem) made it
       * the loudest thing on the dashboard and pushed the KPIs below the fold,
       * and display-lg before that filled the viewport alone.
       */
      <p className="max-w-[62ch] font-serif text-[1.1875rem] leading-[1.6] text-pretty sm:text-[1.375rem]">
        <Narrative text={insight.summary} facts={facts} />
      </p>
    )

  if (!split) {
    return (
      <div className="flex flex-col gap-5">
        {standfirst}
        {supporting}
      </div>
    )
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-10">
      {standfirst}
      {/* Hairline, not a border box: the sidebar is a continuation of the same
          card, not a second one. */}
      <div className="flex min-w-0 flex-col gap-5 border-border-soft lg:border-l lg:pl-10">
        {supporting}
      </div>
    </div>
  )
}
