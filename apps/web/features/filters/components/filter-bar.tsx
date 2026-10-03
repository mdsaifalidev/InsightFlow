"use client"

import * as React from "react"
import { PlusIcon, XIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import type { DatasetDetail } from "@/lib/api/types"
import { COLUMN_TYPES } from "@/features/datasets/constants"
import { humanizeColumn } from "@/features/datasets/labels"

import { MAX_CATEGORY_FILTERS, type WhereFilter } from "../params"
import { useFilters } from "../use-filters"
import { CategoryPicker } from "./category-picker"
import { DateRangeFilter } from "./date-range-filter"

/** Filters shared by the dashboard and the table; state lives in the URL. */
export function FilterBar({
  dataset,
  className,
}: {
  dataset: DatasetDetail
  className?: string
}) {
  const { params, setParams, range, dateColumn, active } = useFilters(dataset)
  const where = params.where

  const filterable = dataset.columns.filter((c) => {
    const type = c.overrideType ?? c.inferredType
    return (
      (type === "categorical" || type === "boolean") &&
      !where.some((w) => w.column === c.name)
    )
  })

  const setWhere = (next: WhereFilter[]) =>
    void setParams({ where: next.length ? next : null })
  const upsert = (column: string, values: string[]) => {
    const rest = where.filter((w) => w.column !== column)
    setWhere(values.length ? [...rest, { column, values }] : rest)
  }

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      role="toolbar"
      aria-label="Filters"
    >
      {dateColumn ? (
        <DateRangeFilter
          preset={params.range}
          range={range}
          bounds={{ min: dateColumn.min, max: dateColumn.max }}
          onChange={(next) => void setParams(next)}
        />
      ) : null}

      {where.map((filter) => (
        <FilterChip
          key={filter.column}
          datasetId={dataset.id}
          filter={filter}
          onChange={(values) => upsert(filter.column, values)}
        />
      ))}

      {where.length < MAX_CATEGORY_FILTERS && filterable.length ? (
        <AddFilter datasetId={dataset.id} columns={filterable} onAdd={upsert} />
      ) : null}

      {active ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            void setParams({ range: null, from: null, to: null, where: null })
          }
        >
          Clear filters
        </Button>
      ) : null}
    </div>
  )
}

function FilterChip({
  datasetId,
  filter,
  onChange,
}: {
  datasetId: string
  filter: WhereFilter
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const summary =
    filter.values.length <= 2
      ? filter.values.join(", ")
      : `${filter.values.slice(0, 2).join(", ")} +${filter.values.length - 2}`

  return (
    <ButtonGroup>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="max-w-72 border-primary/50"
          >
            <span className="text-muted-foreground">
              {humanizeColumn(filter.column)}:
            </span>
            <span className="truncate">{summary}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <CategoryPicker
            datasetId={datasetId}
            column={filter.column}
            initial={filter.values}
            onApply={(values) => {
              onChange(values)
              setOpen(false)
            }}
          />
        </PopoverContent>
      </Popover>
      <Button
        variant="outline"
        size="icon-sm"
        className="border-primary/50"
        aria-label={`Remove ${humanizeColumn(filter.column)} filter`}
        onClick={() => onChange([])}
      >
        <XIcon />
      </Button>
    </ButtonGroup>
  )
}

function AddFilter({
  datasetId,
  columns,
  onAdd,
}: {
  datasetId: string
  columns: DatasetDetail["columns"]
  onAdd: (column: string, values: string[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [column, setColumn] = React.useState<string | null>(null)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setColumn(null)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm">
          <PlusIcon data-icon="inline-start" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        {column ? (
          <CategoryPicker
            datasetId={datasetId}
            column={column}
            initial={[]}
            onBack={() => setColumn(null)}
            onApply={(values) => {
              if (values.length) onAdd(column, values)
              setOpen(false)
              setColumn(null)
            }}
          />
        ) : (
          <Command>
            <CommandInput placeholder="Filter by column" />
            <CommandList>
              <CommandEmpty>No columns to filter by.</CommandEmpty>
              <CommandGroup heading="Columns">
                {columns.map((c) => {
                  const Icon =
                    COLUMN_TYPES[c.overrideType ?? c.inferredType].icon
                  return (
                    <CommandItem
                      key={c.id}
                      value={c.name}
                      onSelect={() => setColumn(c.name)}
                    >
                      <Icon />
                      {humanizeColumn(c.name)}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  )
}
