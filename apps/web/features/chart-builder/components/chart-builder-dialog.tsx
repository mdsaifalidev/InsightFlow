"use client"

import * as React from "react"
import {
  AreaChartIcon,
  BarChartHorizontalIcon,
  ChartColumnIcon,
  LineChartIcon,
  PieChartIcon,
} from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import { toast } from "sonner"

import { ApiError } from "@/lib/api-client"
import type {
  Aggregation,
  ChartType,
  ColumnType,
  DatasetDetail,
  Filters,
  TimeGrain,
  Widget,
  WidgetSpec,
} from "@/lib/api/types"
import { humanizeColumn } from "@/features/datasets/labels"
import { usePreviewQuery, useSaveWidget } from "@/features/dashboard/api"
import { WidgetChart } from "@/features/dashboard/components/widget-chart"

const CHART_TYPES: {
  value: ChartType
  label: string
  icon: React.ElementType
}[] = [
  { value: "line", label: "Line", icon: LineChartIcon },
  { value: "area", label: "Area", icon: AreaChartIcon },
  { value: "bar", label: "Bar", icon: BarChartHorizontalIcon },
  { value: "donut", label: "Donut", icon: PieChartIcon },
  { value: "histogram", label: "Histogram", icon: ChartColumnIcon },
]

/** Which column types each chart can put on its x axis (mirrors the API). */
const X_TYPES: Record<ChartType, ColumnType[]> = {
  line: ["datetime"],
  area: ["datetime"],
  bar: ["categorical", "boolean", "text"],
  donut: ["categorical", "boolean"],
  histogram: ["numeric"],
}

const AGGREGATIONS: { value: Aggregation; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "count", label: "Count of rows" },
  { value: "count_distinct", label: "Distinct count" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
]

/** Words for auto-titles: "Total revenue by month". */
const TITLE_WORDS: Record<Aggregation, string> = {
  sum: "Total",
  avg: "Average",
  count: "Rows",
  count_distinct: "Distinct",
  min: "Minimum",
  max: "Maximum",
}

const GRAINS: TimeGrain[] = ["hour", "day", "week", "month"]
const NONE = "__none__"

type Draft = {
  chartType: ChartType
  x: string
  y: string
  aggregation: Aggregation
  split: string
  timeGrain: TimeGrain
  title: string
}

const typeOf = (c: DatasetDetail["columns"][number]) =>
  c.overrideType ?? c.inferredType

function suggestTitle(d: Draft) {
  if (!d.x) return ""
  if (d.chartType === "histogram")
    return `Distribution of ${humanizeColumn(d.x).toLowerCase()}`
  const measure =
    d.aggregation === "count"
      ? "Rows"
      : `${TITLE_WORDS[d.aggregation]} ${humanizeColumn(d.y || "value").toLowerCase()}`
  const by =
    d.chartType === "line" || d.chartType === "area"
      ? d.timeGrain
      : humanizeColumn(d.x).toLowerCase()
  return `${measure} by ${by}`
}

function toSpec(d: Draft): WidgetSpec | null {
  if (!d.x) return null
  const counts = d.aggregation === "count" || d.chartType === "histogram"
  if (!counts && !d.y) return null
  const timeSeries = d.chartType === "line" || d.chartType === "area"
  return {
    chartType: d.chartType,
    title: d.title.trim() || suggestTitle(d),
    x: d.x,
    y: counts ? undefined : d.y,
    aggregation: d.chartType === "histogram" ? "count" : d.aggregation,
    split:
      d.split && d.chartType !== "donut" && d.chartType !== "histogram"
        ? d.split
        : undefined,
    timeGrain: timeSeries ? d.timeGrain : undefined,
  }
}

function initialDraft(dataset: DatasetDetail, widget?: Widget): Draft {
  if (widget) {
    const s = widget.spec
    return {
      chartType: s.chartType,
      x: s.x,
      y: s.y ?? "",
      aggregation: s.aggregation,
      split: s.split ?? "",
      timeGrain: s.timeGrain ?? "month",
      title: s.title,
    }
  }
  const category = dataset.columns.find((c) => typeOf(c) === "categorical")
  const number = dataset.columns.find((c) => typeOf(c) === "numeric")
  return {
    chartType: "bar",
    x: category?.name ?? "",
    y: number?.name ?? "",
    aggregation: number ? "sum" : "count",
    split: "",
    timeGrain:
      dataset.columns.find((c) => c.profile.datetime)?.profile.datetime
        ?.grain ?? "month",
    title: "",
  }
}

export function ChartBuilderDialog({
  open,
  onOpenChange,
  dataset,
  widget,
  filters,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  dataset: DatasetDetail
  widget?: Widget
  filters: Filters
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-4xl">
        {open ? (
          <BuilderForm
            key={widget?.id ?? "new"}
            dataset={dataset}
            widget={widget}
            filters={filters}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function BuilderForm({
  dataset,
  widget,
  filters,
  onDone,
}: {
  dataset: DatasetDetail
  widget?: Widget
  filters: Filters
  onDone: () => void
}) {
  const [draft, setDraft] = React.useState(() => initialDraft(dataset, widget))
  const [titleTouched, setTitleTouched] = React.useState(!!widget)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const save = useSaveWidget(dataset.id)

  const update = (patch: Partial<Draft>) => {
    setErrors({})
    setDraft((d) => {
      const next = { ...d, ...patch }
      // Keep x valid when the chart type changes.
      const allowed = dataset.columns.filter((c) =>
        X_TYPES[next.chartType].includes(typeOf(c))
      )
      if (!allowed.some((c) => c.name === next.x))
        next.x = allowed[0]?.name ?? ""
      if (!titleTouched) next.title = suggestTitle(next)
      return next
    })
  }

  // Preview lags a little behind typing.
  const spec = toSpec(draft)
  const [previewSpec, setPreviewSpec] = React.useState(spec)
  const specKey = JSON.stringify(spec)
  React.useEffect(() => {
    const t = setTimeout(() => setPreviewSpec(spec), 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey])
  const preview = usePreviewQuery(dataset.id, previewSpec, filters)
  const previewResult = preview.data?.results[0]

  const xColumns = dataset.columns.filter((c) =>
    X_TYPES[draft.chartType].includes(typeOf(c))
  )
  const yColumns = dataset.columns.filter((c) =>
    draft.aggregation === "count_distinct"
      ? true
      : ["numeric", "boolean"].includes(typeOf(c))
  )
  const splitColumns = dataset.columns.filter(
    (c) =>
      typeOf(c) === "categorical" &&
      c.profile.distinctCount <= 20 &&
      c.name !== draft.x
  )
  const needsY =
    draft.chartType !== "histogram" && draft.aggregation !== "count"
  const timeSeries = draft.chartType === "line" || draft.chartType === "area"

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!spec) {
      setErrors({
        ...(draft.x ? {} : { x: "Choose a column." }),
        ...(needsY && !draft.y ? { y: "Choose a value column." } : {}),
      })
      return
    }
    save.mutate(
      { widgetId: widget?.id, spec },
      {
        onSuccess: () => {
          toast.success(widget ? "Chart updated" : "Chart added")
          onDone()
        },
        onError: (error) => {
          if (error instanceof ApiError && error.problem.errors)
            setErrors(error.problem.errors)
          else
            toast.error("Couldn't save the chart", {
              description: error.message,
            })
        },
      }
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>{widget ? "Edit chart" : "Add a chart"}</DialogTitle>
        <DialogDescription>
          Pick what to plot. The preview uses your current filters.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <FieldGroup>
          <Field data-invalid={!!errors.chartType}>
            <FieldLabel>Chart type</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              value={draft.chartType}
              onValueChange={(value) =>
                value && update({ chartType: value as ChartType })
              }
              className="flex-wrap"
            >
              {CHART_TYPES.map(({ value, label, icon: Icon }) => (
                <ToggleGroupItem
                  key={value}
                  value={value}
                  aria-label={label}
                  title={label}
                >
                  <Icon />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            {errors.chartType ? (
              <FieldError>{errors.chartType}</FieldError>
            ) : null}
          </Field>

          <Field data-invalid={!!errors.x}>
            <FieldLabel htmlFor="builder-x">
              {timeSeries
                ? "Date column"
                : draft.chartType === "histogram"
                  ? "Number column"
                  : "Group by"}
            </FieldLabel>
            <Select value={draft.x} onValueChange={(x) => update({ x })}>
              <SelectTrigger id="builder-x" aria-invalid={!!errors.x}>
                <SelectValue
                  placeholder={
                    xColumns.length ? "Choose a column" : "No suitable columns"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {xColumns.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {humanizeColumn(c.name)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {errors.x ? <FieldError>{errors.x}</FieldError> : null}
          </Field>

          {timeSeries ? (
            <Field>
              <FieldLabel htmlFor="builder-grain">Group dates by</FieldLabel>
              <Select
                value={draft.timeGrain}
                onValueChange={(g) => update({ timeGrain: g as TimeGrain })}
              >
                <SelectTrigger id="builder-grain">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {GRAINS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g.charAt(0).toUpperCase() + g.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {draft.chartType !== "histogram" ? (
            <Field data-invalid={!!errors.aggregation}>
              <FieldLabel htmlFor="builder-agg">Summarize</FieldLabel>
              <Select
                value={draft.aggregation}
                onValueChange={(a) => update({ aggregation: a as Aggregation })}
              >
                <SelectTrigger id="builder-agg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {AGGREGATIONS.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          ) : null}

          {needsY ? (
            <Field data-invalid={!!errors.y}>
              <FieldLabel htmlFor="builder-y">Of</FieldLabel>
              <Select value={draft.y} onValueChange={(y) => update({ y })}>
                <SelectTrigger id="builder-y" aria-invalid={!!errors.y}>
                  <SelectValue placeholder="Choose a value column" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {yColumns.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {humanizeColumn(c.name)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.y ? <FieldError>{errors.y}</FieldError> : null}
            </Field>
          ) : null}

          {draft.chartType !== "donut" && draft.chartType !== "histogram" ? (
            <Field data-invalid={!!errors.split}>
              <FieldLabel htmlFor="builder-split">Split into series</FieldLabel>
              <Select
                value={draft.split || NONE}
                onValueChange={(v) => update({ split: v === NONE ? "" : v })}
              >
                <SelectTrigger id="builder-split">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE}>Don&apos;t split</SelectItem>
                    {splitColumns.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {humanizeColumn(c.name)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {errors.split ? <FieldError>{errors.split}</FieldError> : null}
            </Field>
          ) : null}

          <Field data-invalid={!!errors.title}>
            <FieldLabel htmlFor="builder-title">Title</FieldLabel>
            <Input
              id="builder-title"
              value={draft.title}
              aria-invalid={!!errors.title}
              onChange={(e) => {
                setTitleTouched(true)
                setDraft((d) => ({ ...d, title: e.target.value }))
              }}
            />
            {errors.title ? <FieldError>{errors.title}</FieldError> : null}
          </Field>
        </FieldGroup>

        {/* bg-card, not the dialog's popover: the dark chart palette is
            validated against --card, and --popover is a rung lighter. */}
        <div className="flex min-w-0 flex-col gap-3 rounded-lg bg-card p-4 ring-1 ring-border-soft">
          <span className="text-section">{spec?.title || "Preview"}</span>
          {!spec ? (
            <Empty className="h-60">
              <EmptyHeader>
                <EmptyTitle>Nothing to preview yet</EmptyTitle>
                <EmptyDescription>Choose the columns to plot.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : !previewResult ? (
            <Skeleton className="h-60 w-full" />
          ) : previewResult.points.length === 0 ? (
            <Empty className="h-60">
              <EmptyHeader>
                <EmptyTitle>No data for this chart</EmptyTitle>
                <EmptyDescription>
                  Try other columns or clear the filters.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div
              className={
                preview.isFetching ? "opacity-60 transition-opacity" : undefined
              }
            >
              <WidgetChart
                widgetId="preview"
                spec={previewSpec ?? spec}
                result={previewResult}
              />
            </div>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={save.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? <Spinner data-icon="inline-start" /> : null}
          {widget ? "Save changes" : "Add to dashboard"}
        </Button>
      </DialogFooter>
    </form>
  )
}
