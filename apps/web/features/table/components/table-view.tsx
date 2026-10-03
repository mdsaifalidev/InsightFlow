"use client"

import * as React from "react"
import {
  columnResizingFeature,
  columnSizingFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table"
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import {
  parseAsInteger,
  parseAsNumberLiteral,
  parseAsString,
  useQueryStates,
} from "nuqs"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import type { ColumnType, DatasetColumn } from "@/lib/api/types"
import { formatDate, formatNumber } from "@/lib/format"
import { ColumnProfileDetails } from "@/features/columns/components/column-profile-details"
import { COLUMN_TYPES } from "@/features/datasets/constants"
import { useCurrentDataset } from "@/features/datasets/components/dataset-frame"
import { humanizeColumn } from "@/features/datasets/labels"
import { useFilters } from "@/features/filters/use-filters"

import { useRows } from "../api"

type RowData = Record<string, string | number | boolean | null>

const PAGE_SIZES = [50, 100, 250] as const
const features = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  columnSizingFeature,
  columnResizingFeature,
})
const helper = createColumnHelper<typeof features, RowData>()

export const tableParams = {
  sort: parseAsString,
  page: parseAsInteger.withDefault(1),
  size: parseAsNumberLiteral(PAGE_SIZES).withDefault(50),
}

const typeOf = (c: DatasetColumn): ColumnType =>
  c.overrideType ?? c.inferredType
const numeric = (c: DatasetColumn) => typeOf(c) === "numeric"

function Cell({ value, type }: { value: RowData[string]; type: ColumnType }) {
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>
  }
  if (type === "numeric" && typeof value === "number")
    return <>{formatNumber(value)}</>
  if (type === "datetime" && typeof value === "string")
    return <>{formatDate(value)}</>
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>
  return <>{String(value)}</>
}

export function TableView() {
  const dataset = useCurrentDataset()
  const { filters } = useFilters(dataset)
  const [{ sort, page, size }, setParams] = useQueryStates(tableParams)

  const filterKey = JSON.stringify(filters)
  const previousFilterKey = React.useRef(filterKey)
  React.useEffect(() => {
    // New filters start from the first page.
    if (previousFilterKey.current !== filterKey && page !== 1)
      void setParams({ page: null })
    previousFilterKey.current = filterKey
  }, [filterKey, page, setParams])

  const rows = useRows(dataset.id, { page, pageSize: size, sort, filters })
  const total = rows.data?.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / size))

  const [sortId, sortDir] = (sort ?? "").split(":")
  const sorting = sortId ? [{ id: sortId, desc: sortDir === "desc" }] : []

  const columns = React.useMemo(
    () =>
      // helper.columns() erases per-column value types (v9 idiom).
      helper.columns(
        dataset.columns.map((column) =>
          helper.accessor((row) => row[column.name] ?? null, {
            id: column.name,
            size: numeric(column)
              ? 130
              : typeOf(column) === "datetime"
                ? 150
                : 180,
            minSize: 80,
            header: () => <ColumnHeader column={column} />,
            cell: (info) => (
              <Cell value={info.getValue()} type={typeOf(column)} />
            ),
          })
        )
      ),
    [dataset.columns]
  )

  const table = useTable({
    features,
    columns,
    data: rows.data?.rows ?? [],
    manualSorting: true,
    manualPagination: true,
    rowCount: total,
    columnResizeMode: "onChange",
    state: { sorting, pagination: { pageIndex: page - 1, pageSize: size } },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sorting) : updater
      const first = next[0]
      void setParams({
        sort: first ? `${first.id}:${first.desc ? "desc" : "asc"}` : null,
        page: null,
      })
    },
    onPaginationChange: (updater) => {
      const current = { pageIndex: page - 1, pageSize: size }
      const next = typeof updater === "function" ? updater(current) : updater
      void setParams({
        page: next.pageIndex + 1 === 1 ? null : next.pageIndex + 1,
        size:
          next.pageSize === 50
            ? null
            : (next.pageSize as (typeof PAGE_SIZES)[number]),
      })
    },
  })

  // Column widths as CSS variables, computed once per render (TanStack guidance).
  const headers = table.getFlatHeaders()
  const sizeVars: Record<string, string> = {}
  for (const header of headers)
    sizeVars[`--col-${header.id}`] = `${header.getSize()}px`

  if (rows.isError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Rows couldn&apos;t be loaded</AlertTitle>
        <AlertDescription>{rows.error.message}</AlertDescription>
      </Alert>
    )
  }

  const from = total ? (page - 1) * size + 1 : 0
  const to = Math.min(page * size, total)

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        className={cn(
          "relative max-h-[70svh] overflow-auto rounded-lg bg-card shadow-e1 ring-1 ring-border-soft",
          rows.isFetching && !rows.isPending && "opacity-70 transition-opacity"
        )}
        tabIndex={0}
        role="region"
        aria-label={`${dataset.name} rows`}
      >
        <table
          className="caption-bottom text-[13px]"
          style={
            { ...sizeVars, width: table.getTotalSize() } as React.CSSProperties
          }
        >
          {/* Opaque (it is sticky) and a step off the card, mixed from the
              theme's own tokens so it needs no extra surface rung. */}
          <TableHeader className="sticky top-0 z-10 bg-[color-mix(in_oklab,var(--card),var(--foreground)_3.5%)] shadow-[inset_0_-1px_0_var(--border)]">
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id} className="hover:bg-transparent">
                {group.headers.map((header) => {
                  const column = dataset.columns.find(
                    (c) => c.name === header.id
                  )!
                  const sorted = header.column.getIsSorted()
                  const Icon =
                    sorted === "asc"
                      ? ArrowUpIcon
                      : sorted === "desc"
                        ? ArrowDownIcon
                        : ArrowUpDownIcon
                  return (
                    <TableHead
                      key={header.id}
                      data-column={header.id}
                      className="group relative border-r border-border-soft text-foreground last:border-r-0"
                      style={{ width: `var(--col-${header.id})` }}
                      aria-sort={
                        sorted === "asc"
                          ? "ascending"
                          : sorted === "desc"
                            ? "descending"
                            : "none"
                      }
                    >
                      <div
                        className={cn(
                          "flex items-center gap-1",
                          numeric(column) && "justify-end"
                        )}
                      >
                        <table.FlexRender header={header} />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={cn(
                            !sorted && "opacity-40 group-hover:opacity-100"
                          )}
                          aria-label={`Sort by ${humanizeColumn(column.name)}`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <Icon />
                        </Button>
                      </div>
                      <div
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${humanizeColumn(column.name)}`}
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onDoubleClick={() => header.column.resetSize()}
                        className={cn(
                          "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                          header.column.getIsResizing()
                            ? "bg-primary"
                            : "hover:bg-border"
                        )}
                      />
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.isPending
              ? Array.from({ length: 10 }, (_, i) => (
                  <TableRow key={i}>
                    {headers.map((h) => (
                      <TableCell key={h.id}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getAllCells().map((cell) => {
                      const column = dataset.columns.find(
                        (c) => c.name === cell.column.id
                      )!
                      return (
                        <TableCell
                          key={cell.id}
                          data-column={cell.column.id}
                          className={cn(
                            "truncate border-r border-border-soft last:border-r-0",
                            numeric(column) && "text-right tabular-nums"
                          )}
                          style={{
                            width: `var(--col-${cell.column.id})`,
                            maxWidth: `var(--col-${cell.column.id})`,
                          }}
                        >
                          <table.FlexRender cell={cell} />
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
          </TableBody>
        </table>
        {!rows.isPending && total === 0 ? (
          <Empty className="py-12">
            <EmptyHeader>
              <EmptyTitle>No rows match these filters</EmptyTitle>
              <EmptyDescription>
                Widen the date range or remove a filter.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
        <p className="text-muted-foreground tabular-nums" aria-live="polite">
          {total
            ? `Rows ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`
            : "No rows"}
        </p>
        <div className="flex items-center gap-2">
          <Select
            value={String(size)}
            onValueChange={(v) => table.setPageSize(Number(v))}
          >
            <SelectTrigger
              size="sm"
              className="w-32"
              aria-label="Rows per page"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} per page
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <span className="text-muted-foreground tabular-nums">
            Page {formatNumber(page)} of {formatNumber(pageCount)}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => table.previousPage()}
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={page >= pageCount}
            onClick={() => table.nextPage()}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ColumnHeader({ column }: { column: DatasetColumn }) {
  const type = typeOf(column)
  const Icon = COLUMN_TYPES[type].icon
  return (
    <HoverCard openDelay={250}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 rounded-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <span className="truncate">{column.name}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80">
        <ColumnProfileDetails column={column} type={type} />
      </HoverCardContent>
    </HoverCard>
  )
}
