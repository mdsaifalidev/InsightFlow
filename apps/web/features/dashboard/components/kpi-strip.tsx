"use client"

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "lucide-react"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import type { Kpi } from "@/lib/api/types"
import { CountUp } from "@/features/marketing/components/count-up"
import { formatDelta, formatValue } from "@/lib/format"

/** Rates of bad things (churn, errors) are better when they go down. */
function upIsGood(kpi: Kpi) {
  return !kpi.id.startsWith("rate:")
}

/**
 * One ruled row of headline numbers -- figures on the page between hairlines,
 * not a box and not a grid of identical cards. Only what needs a surface gets
 * one (charts, the Brief); a number does not.
 */
export function KpiStrip({
  kpis,
  loading,
  animate = false,
}: {
  kpis: Kpi[] | undefined
  loading: boolean
  /**
   * Count the values up when they scroll into view. Opt-in, and only the
   * landing page opts in: the product screenshots (`pnpm --filter web shots`)
   * capture this component and must stay byte-identical between runs.
   */
  animate?: boolean
}) {
  if (!kpis) {
    return <Skeleton className="h-24 w-full rounded-md" />
  }

  return (
    <dl
      data-testid="kpi-strip"
      className={cn(
        "grid grid-cols-2 border-y transition-opacity md:auto-cols-fr md:grid-flow-col md:grid-cols-none",
        loading && "opacity-60"
      )}
    >
      {kpis.map((kpi, i) => {
        const delta = kpi.delta
        const direction =
          delta === null || Math.abs(delta) < 0.0005 ? 0 : delta > 0 ? 1 : -1
        const good = direction === 0 ? null : direction > 0 === upIsGood(kpi)
        const Arrow =
          direction > 0
            ? ArrowUpRightIcon
            : direction < 0
              ? ArrowDownRightIcon
              : MinusIcon
        return (
          <div
            key={kpi.id}
            data-testid="kpi"
            data-kpi={kpi.id}
            className={cn(
              "flex min-w-0 flex-col gap-1.5 py-3.5 pr-4",
              // Hairline rules between cells: vertical on desktop, a 2×2 grid on mobile.
              i % 2 === 1 && "border-l pl-4",
              i >= 2 && "border-t md:border-t-0",
              i >= 1 && "md:border-l md:pl-5"
            )}
          >
            <dt
              data-testid="kpi-label"
              className="truncate text-label text-muted-foreground"
            >
              {kpi.label}
            </dt>
            <dd
              data-testid="kpi-value"
              className="truncate text-2xl font-semibold tracking-tight tabular-nums md:text-data-lg"
            >
              {animate ? (
                <CountUp
                  value={kpi.value}
                  format={(n) => formatValue(n, kpi.format, { compact: true })}
                />
              ) : (
                formatValue(kpi.value, kpi.format, { compact: true })
              )}
            </dd>
            {delta !== null ? (
              <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-medium tabular-nums",
                    good === true && "text-up",
                    good === false && "text-down",
                    good === null && "text-muted-foreground"
                  )}
                >
                  <Arrow className="size-3.5" aria-hidden />
                  <span className="sr-only">
                    {direction > 0 ? "Up" : direction < 0 ? "Down" : "Flat"}
                  </span>
                  {formatDelta(delta)}
                </span>
                <span className="truncate text-muted-foreground">
                  {kpi.deltaLabel}
                </span>
              </dd>
            ) : (
              <dd className="text-xs text-muted-foreground">
                No comparison period
              </dd>
            )}
          </div>
        )
      })}
    </dl>
  )
}
