"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { formatNumber } from "@/lib/format"
import { humanizeColumn } from "@/features/datasets/labels"

import { useFilterValues } from "../api"

/** Multi-select of a column's values, searched server-side. */
export function CategoryPicker({
  datasetId,
  column,
  initial,
  onApply,
  onBack,
}: {
  datasetId: string
  column: string
  initial: string[]
  onApply: (values: string[]) => void
  onBack?: () => void
}) {
  const [q, setQ] = React.useState("")
  const deferredQ = React.useDeferredValue(q)
  const [selected, setSelected] = React.useState(() => new Set(initial))
  const values = useFilterValues(datasetId, column, deferredQ)

  const toggle = (value: string) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })

  return (
    <div className="flex flex-col">
      <Command shouldFilter={false}>
        <CommandInput
          placeholder={`Search ${humanizeColumn(column).toLowerCase()}`}
          value={q}
          onValueChange={setQ}
        />
        <CommandList>
          {values.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : (
            <>
              <CommandEmpty>No matching values.</CommandEmpty>
              <CommandGroup heading={humanizeColumn(column)}>
                {values.data?.values.map(({ value, count }) => (
                  <CommandItem
                    key={value}
                    value={value}
                    onSelect={() => toggle(value)}
                  >
                    <span
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border",
                        selected.has(value)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "opacity-60"
                      )}
                      aria-hidden
                    >
                      {selected.has(value) ? (
                        <CheckIcon className="size-3" />
                      ) : null}
                    </span>
                    <span className="truncate">{value}</span>
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                      {formatNumber(count)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
      <div className="flex items-center justify-between gap-2 border-t p-2">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {selected.size} selected
          </span>
        )}
        <Button size="sm" onClick={() => onApply([...selected])}>
          {selected.size ? "Apply" : "Remove filter"}
        </Button>
      </div>
    </div>
  )
}
