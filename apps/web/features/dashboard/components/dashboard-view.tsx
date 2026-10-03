"use client"

import * as React from "react"
import { PlusIcon } from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"
import { toast } from "sonner"

import type { Widget } from "@/lib/api/types"
import { useCurrentDataset } from "@/features/datasets/components/dataset-frame"
import { useFilters } from "@/features/filters/use-filters"
import { ChartBuilderDialog } from "@/features/chart-builder/components/chart-builder-dialog"
import { useInsight } from "@/features/insights/api"
import { Brief } from "@/features/insights/components/brief"

import { useDashboard, useDashboardQuery, useDeleteWidget } from "../api"
import { HighlightProvider } from "../highlight"
import { widgetSpan } from "../widget-span"
import { KpiStrip } from "./kpi-strip"
import { WidgetCard } from "./widget-card"

export function DashboardView() {
  const dataset = useCurrentDataset()
  const { filters, active } = useFilters(dataset)
  const dashboard = useDashboard(dataset.id)
  const query = useDashboardQuery(dataset.id, dashboard.data?.widgets, filters)
  const insight = useInsight(dataset.id)
  const deleteWidget = useDeleteWidget(dataset.id)

  const [builder, setBuilder] = React.useState<{
    open: boolean
    widget?: Widget
  }>({ open: false })
  // Kept after closing so the title doesn't blank out during the exit animation.
  const [removing, setRemoving] = React.useState<Widget | null>(null)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  // Anomaly markers per chart, from the Brief's facts.
  const anomaliesByWidget = React.useMemo(() => {
    const map = new Map<string, { x: string | number; label: string }[]>()
    for (const anomaly of insight.data?.anomalies ?? []) {
      const ref = insight.data?.facts.find((f) => f.id === anomaly.factId)?.ref
      if (!ref) continue
      map.set(ref.widgetId, [
        ...(map.get(ref.widgetId) ?? []),
        { x: ref.x, label: anomaly.description },
      ])
    }
    return map
  }, [insight.data])

  if (dashboard.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>The dashboard couldn&apos;t be loaded</AlertTitle>
        <AlertDescription>{dashboard.error.message}</AlertDescription>
      </Alert>
    )
  }

  const results = new Map(query.data?.results.map((r) => [r.widgetId, r]))
  const widgets = dashboard.data?.widgets ?? []

  return (
    <HighlightProvider>
      <div className="flex flex-col gap-5">
        {/*
         * A KPI rail beside the Brief was tried and reverted: our Brief is a
         * standfirst plus two columns plus chips plus provenance, so three
         * cells left several hundred pixels of empty card next to it, and it
         * pinned the numbers a screen above the charts they summarise. The
         * split that does work is inside the Brief itself — see its `layout`.
         */}
        <Brief
          datasetId={dataset.id}
          datasetName={dataset.name}
          filtersActive={active}
        />

        <KpiStrip
          kpis={query.data?.kpis ?? (active ? undefined : dashboard.data?.kpis)}
          loading={query.isFetching}
        />

        <section
          aria-labelledby="charts-heading"
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 id="charts-heading" className="text-section">
              Charts
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBuilder({ open: true })}
            >
              <PlusIcon data-icon="inline-start" />
              Add chart
            </Button>
          </div>

          {dashboard.isPending ? (
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton
                  key={i}
                  className={cn("h-72 rounded-lg", i === 0 && "md:col-span-2")}
                />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {widgets.map((widget, i) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  result={results.get(widget.id)}
                  loading={query.isFetching}
                  anomalies={anomaliesByWidget.get(widget.id)}
                  onEdit={
                    widget.kind === "custom"
                      ? () => setBuilder({ open: true, widget })
                      : undefined
                  }
                  onDelete={() => {
                    setRemoving(widget)
                    setConfirmOpen(true)
                  }}
                  className={cn(
                    // Which widget earns the full row — see ../widget-span.ts,
                    // which also records why a mixed-span mosaic was rejected.
                    widgetSpan(widget, i),
                    // Widgets settle in as their data lands. CSS + motion-safe,
                    // so `pnpm --filter web shots` captures them already still.
                    "motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
                  )}
                  style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <ChartBuilderDialog
        open={builder.open}
        onOpenChange={(open) => setBuilder((b) => ({ ...b, open }))}
        dataset={dataset}
        widget={builder.widget}
        filters={filters}
      />

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove &ldquo;{removing?.spec.title}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.kind === "auto"
                ? "This built-in chart won't come back unless the dataset is re-processed. You can recreate it with Add chart."
                : "The chart is removed from this dashboard."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!removing) return
                deleteWidget.mutate(removing.id, {
                  onSuccess: () => toast.success("Chart removed"),
                  onError: (error) =>
                    toast.error("Couldn't remove the chart", {
                      description: error.message,
                    }),
                })
              }}
            >
              Remove chart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </HighlightProvider>
  )
}
