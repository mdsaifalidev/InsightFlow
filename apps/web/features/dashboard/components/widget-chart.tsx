"use client"

import * as React from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from "@workspace/ui/lib/recharts"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"

import type { SeriesPoint, WidgetResult, WidgetSpec } from "@/lib/api/types"
import { formatBucket, formatValue } from "@/lib/format"

import { useWidgetHighlight } from "../highlight"

// Mark specs (dataviz): 2px lines, <=24px bars with 4px rounded data ends,
// >=8px markers with a 2px surface ring, hairline solid grid, 2px surface gaps.
const SERIES_COLORS = [1, 2, 3, 4, 5, 6].map((i) => `var(--chart-${i})`)
const BAR_SIZE = 18
const DIM = 0.35

export type ChartAnomaly = { x: string | number; label: string }

/** Series names can't be CSS variable names ("/api/checkout"), so use s0..sN. */
function toChartData(result: WidgetResult) {
  const keys = result.series.map((_, i) => `s${i}`)
  const config: ChartConfig = Object.fromEntries(
    result.series.map((name, i) => [
      keys[i]!,
      {
        label: name === "value" ? "Value" : name,
        color: SERIES_COLORS[i % SERIES_COLORS.length]!,
      },
    ])
  )
  const data = result.points.map((point) => {
    const row: Record<string, string | number | undefined> = {
      x: point.x,
      x2: point.x2,
    }
    result.series.forEach((name, i) => {
      row[keys[i]!] = point[name] as number | undefined
    })
    return row
  })
  return { keys, config, data }
}

function Tooltip({
  result,
  config,
  labelFor,
}: {
  result: WidgetResult
  config: ChartConfig
  labelFor: (x: string | number, row?: Record<string, unknown>) => string
}) {
  return (
    <ChartTooltip
      cursor={{ strokeWidth: 1 }}
      content={
        <ChartTooltipContent
          labelFormatter={(_, payload) => {
            const row = payload?.[0]?.payload as
              Record<string, unknown> | undefined
            return row ? labelFor(row.x as string | number, row) : ""
          }}
          formatter={(value, _name, item) => (
            <div className="flex w-full items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span
                  className="size-2 rounded-[2px]"
                  style={{ background: item.color }}
                  aria-hidden
                />
                {config[String(item.dataKey)]?.label ?? String(item.name)}
              </span>
              <span className="font-medium text-foreground tabular-nums">
                {formatValue(Number(value), result.format)}
              </span>
            </div>
          )}
        />
      }
    />
  )
}

export function WidgetChart({
  widgetId,
  spec,
  result,
  anomalies = [],
}: {
  widgetId: string
  spec: WidgetSpec
  result: WidgetResult
  anomalies?: ChartAnomaly[]
}) {
  const highlighted = useWidgetHighlight(widgetId)
  const { keys, config, data } = React.useMemo(() => {
    const chart = toChartData(result)
    // Legend and tooltip names come from the real series labels.
    for (const [i, key] of chart.keys.entries()) {
      chart.config[key]!.label =
        result.series[i] === "value" ? spec.title : result.series[i]
    }
    return chart
  }, [result, spec.title])
  const multi = keys.length > 1
  const compact = (v: number) =>
    formatValue(v, result.format, { compact: true })
  const grain = spec.timeGrain ?? "day"

  if (spec.chartType === "line" || spec.chartType === "area") {
    const Chart = spec.chartType === "area" ? AreaChart : LineChart
    const first = keys[0]!
    const pointAt = (x: string | number) => data.find((d) => d.x === x)
    return (
      <ChartContainer config={config} className="aspect-auto h-60 w-full">
        <Chart
          data={data}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickMargin={8}
            tickFormatter={(x: string) => formatBucket(x, grain)}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={compact}
            // Recharts defaults to [0, "auto"], which flattens the story. On the
            // orders sample the April dip the Brief is entirely about -- the one
            // a reader clicks a grounded number to find -- was a shallow notch on
            // a 0-200K axis. Lines get a fitted domain; AREA KEEPS ZERO, because
            // the filled region encodes magnitude from the baseline and
            // truncating it misreports the quantity.
            domain={spec.chartType === "line" ? ["auto", "auto"] : [0, "auto"]}
            padding={{ top: 12, bottom: 12 }}
          />
          <Tooltip
            result={result}
            config={config}
            labelFor={(x) => formatBucket(String(x), grain, "full")}
          />
          {multi ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {keys.map((key) =>
            spec.chartType === "area" ? (
              <Area
                key={key}
                dataKey={key}
                type="linear"
                stroke={`var(--color-${key})`}
                fill={`var(--color-${key})`}
                fillOpacity={0.12}
                strokeWidth={2}
                stackId={multi ? "a" : undefined}
                isAnimationActive={false}
              />
            ) : (
              <Line
                key={key}
                dataKey={key}
                type="linear"
                stroke={`var(--color-${key})`}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                isAnimationActive={false}
              />
            )
          )}
          {anomalies.map((a) =>
            pointAt(a.x) ? (
              <ReferenceDot
                key={`anomaly-${a.x}`}
                x={a.x}
                y={Number(pointAt(a.x)![first])}
                r={5}
                fill="var(--signal)"
                stroke="var(--card)"
                strokeWidth={2}
                ifOverflow="extendDomain"
              />
            ) : null
          )}
          {highlighted !== null && pointAt(highlighted) ? (
            <>
              <ReferenceLine
                x={highlighted}
                stroke="var(--signal)"
                strokeWidth={1}
              />
              <ReferenceDot
                x={highlighted}
                y={Number(pointAt(highlighted)![first])}
                r={7}
                fill="var(--signal)"
                stroke="var(--card)"
                strokeWidth={2}
              />
            </>
          ) : null}
        </Chart>
      </ChartContainer>
    )
  }

  if (spec.chartType === "donut") {
    const key = keys[0]!
    const slices = data.map((d, i) => ({
      name: String(d.x),
      value: Number(d[key] ?? 0),
      fill: SERIES_COLORS[i % 6],
    }))
    const total = slices.reduce((sum, s) => sum + s.value, 0)
    const sliceConfig: ChartConfig = Object.fromEntries(
      slices.map((s, i) => [`c${i}`, { label: s.name, color: s.fill }])
    )
    return (
      <div className="flex flex-col gap-3">
        <ChartContainer
          config={sliceConfig}
          className="aspect-auto h-52 w-full"
        >
          <PieChart accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-4">
                      <span className="text-muted-foreground">
                        {String(name)}
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatValue(Number(value), result.format)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="55%"
              outerRadius="85%"
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((s) => (
                <Cell
                  key={s.name}
                  fill={s.fill}
                  fillOpacity={
                    highlighted !== null && highlighted !== s.name ? DIM : 1
                  }
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul
          className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs"
          aria-label="Legend"
        >
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span
                className="size-2.5 shrink-0 rounded-[2px]"
                style={{ background: s.fill }}
                aria-hidden
              />
              <span className="text-foreground">{s.name}</span>
              <span className="text-muted-foreground tabular-nums">
                {total ? `${Math.round((s.value / total) * 100)}%` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  if (spec.chartType === "histogram") {
    const key = keys[0]!
    const xFormat = result.xFormat ?? "number"
    const binLabel = (row: Record<string, unknown>) =>
      `${formatValue(Number(row.x), xFormat)} to ${formatValue(Number(row.x2), xFormat)}`
    return (
      <ChartContainer config={config} className="aspect-auto h-60 w-full">
        <BarChart
          data={data}
          barCategoryGap={2}
          margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
          accessibilityLayer
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="x"
            tickLine={false}
            axisLine={false}
            minTickGap={24}
            tickMargin={8}
            tickFormatter={(v: number) =>
              formatValue(v, xFormat, { compact: true })
            }
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={compact}
          />
          <Tooltip
            result={{ ...result, format: "number" }}
            config={{ [key]: { label: "Rows", color: SERIES_COLORS[0] } }}
            labelFor={(_, row) => binLabel(row ?? {})}
          />
          <Bar
            dataKey={key}
            fill={`var(--color-${key})`}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ChartContainer>
    )
  }

  // Bars: horizontal, so long category names stay readable.
  const height = Math.max(160, data.length * (multi ? 44 : 32) + 40)
  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full"
      style={{ height }}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
        barGap={2}
        accessibilityLayer
      >
        <CartesianGrid horizontal={false} />
        <YAxis
          dataKey="x"
          type="category"
          tickLine={false}
          axisLine={false}
          // Wide enough that "Middle East & Africa" stops wrapping onto a
          // second line under its own ellipsis.
          width={148}
          tickFormatter={(v: string) =>
            v.length > 22 ? `${v.slice(0, 21)}…` : v
          }
        />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          tickFormatter={compact}
        />
        <Tooltip result={result} config={config} labelFor={(x) => String(x)} />
        {multi ? <ChartLegend content={<ChartLegendContent />} /> : null}
        {keys.map((key) => (
          <Bar
            key={key}
            dataKey={key}
            fill={`var(--color-${key})`}
            radius={[0, 4, 4, 0]}
            barSize={multi ? 12 : BAR_SIZE}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell
                key={String(d.x)}
                fillOpacity={
                  highlighted !== null && highlighted !== d.x ? DIM : 1
                }
                stroke={highlighted === d.x ? "var(--signal)" : undefined}
                strokeWidth={highlighted === d.x ? 2 : 0}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ChartContainer>
  )
}

/** Plain table of a result: the accessible alternative to every chart. */
export function resultRows(
  spec: WidgetSpec,
  result: WidgetResult,
  point: SeriesPoint
) {
  const grain = spec.timeGrain ?? "day"
  const label =
    spec.chartType === "line" || spec.chartType === "area"
      ? formatBucket(String(point.x), grain, "full")
      : spec.chartType === "histogram"
        ? `${formatValue(Number(point.x), result.xFormat ?? "number")} to ${formatValue(Number(point.x2), result.xFormat ?? "number")}`
        : String(point.x)
  return {
    label,
    values: result.series.map((name) =>
      formatValue(Number(point[name] ?? 0), result.format)
    ),
  }
}
