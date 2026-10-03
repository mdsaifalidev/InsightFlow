"use client"

import * as React from "react"
import { MoreHorizontalIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import type { Widget, WidgetResult, WidgetSpec } from "@/lib/api/types"
import { humanizeColumn } from "@/features/datasets/labels"

import { resultRows, WidgetChart, type ChartAnomaly } from "./widget-chart"

const AGGREGATION_WORDS: Record<WidgetSpec["aggregation"], string> = {
  sum: "Sum of",
  avg: "Average",
  count: "Count of rows",
  count_distinct: "Distinct",
  min: "Minimum",
  max: "Maximum",
}

/** "Sum of revenue by month", "Count of rows by device". */
export function describeSpec(spec: WidgetSpec) {
  if (spec.chartType === "histogram")
    return `How ${humanizeColumn(spec.x).toLowerCase()} values are spread`
  const measure =
    spec.aggregation === "count"
      ? AGGREGATION_WORDS.count
      : `${AGGREGATION_WORDS[spec.aggregation]} ${humanizeColumn(spec.y ?? "").toLowerCase()}`
  const by =
    spec.chartType === "line" || spec.chartType === "area"
      ? `by ${spec.timeGrain ?? "day"}`
      : `by ${humanizeColumn(spec.x).toLowerCase()}`
  const split = spec.split
    ? `, split by ${humanizeColumn(spec.split).toLowerCase()}`
    : ""
  return `${measure} ${by}${split}`
}

export function WidgetCard({
  widget,
  result,
  loading,
  anomalies,
  onEdit,
  onDelete,
  className,
  style,
}: {
  widget: Widget
  result: WidgetResult | undefined
  loading: boolean
  anomalies?: ChartAnomaly[]
  onEdit?: () => void
  onDelete: () => void
  className?: string
  style?: React.CSSProperties
}) {
  const [asTable, setAsTable] = React.useState(false)
  const empty =
    result &&
    (result.points.length === 0 ||
      result.points.every((p) => result.series.every((s) => !p[s])))

  return (
    <Card
      className={cn("gap-3", className)}
      style={style}
      data-widget-id={widget.id}
    >
      <CardHeader>
        <CardTitle>{widget.spec.title}</CardTitle>
        {/* An auto chart's title already says what its spec says ("Total
            revenue by month" over "Sum of revenue by month"). A custom title
            is the user's words, so the spec is information there. */}
        {widget.kind === "custom" ? (
          <CardDescription>{describeSpec(widget.spec)}</CardDescription>
        ) : null}
        <CardAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Options for ${widget.spec.title}`}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => setAsTable((v) => !v)}>
                  {asTable ? "Show as chart" : "Show as table"}
                </DropdownMenuItem>
                {onEdit ? (
                  <DropdownMenuItem onSelect={onEdit}>
                    Edit chart
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Remove from dashboard
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!result && loading ? (
          <Skeleton className="h-60 w-full" />
        ) : !result || empty ? (
          <Empty className="h-60">
            <EmptyHeader>
              <EmptyTitle>No rows match these filters</EmptyTitle>
              <EmptyDescription>
                Widen the date range or remove a filter.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : asTable ? (
          <div className="max-h-60 overflow-auto rounded-md border border-border-soft">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {widget.spec.chartType === "line" ||
                    widget.spec.chartType === "area"
                      ? "Period"
                      : humanizeColumn(widget.spec.x)}
                  </TableHead>
                  {result.series.map((s) => (
                    <TableHead key={s} className="text-right">
                      {s === "value" ? "Value" : s}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.points.map((point) => {
                  const row = resultRows(widget.spec, result, point)
                  return (
                    <TableRow key={String(point.x)}>
                      <TableCell>{row.label}</TableCell>
                      {row.values.map((v, i) => (
                        <TableCell key={i} className="text-right tabular-nums">
                          {v}
                        </TableCell>
                      ))}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <WidgetChart
              widgetId={widget.id}
              spec={widget.spec}
              result={result}
              anomalies={anomalies}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
