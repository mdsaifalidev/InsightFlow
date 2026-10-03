"use client"

import * as React from "react"
import { format, parseISO } from "date-fns"
import { CalendarIcon, ChevronDownIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { cn } from "@workspace/ui/lib/utils"

import { PRESET_LABELS, type RangePreset } from "../params"

const QUICK: RangePreset[] = ["all", "7d", "30d", "90d", "ytd"]

function rangeLabel(from: string, to: string) {
  const a = parseISO(from)
  const b = parseISO(to)
  const sameYear = from.slice(0, 4) === to.slice(0, 4)
  return `${format(a, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(b, "MMM d, yyyy")}`
}

export function DateRangeFilter({
  preset,
  range,
  bounds,
  onChange,
}: {
  preset: RangePreset
  range: { from: string; to: string } | undefined
  /** The data's first and last dates. */
  bounds: { min: string; max: string }
  onChange: (next: {
    range: RangePreset
    from: string | null
    to: string | null
  }) => void
}) {
  const [open, setOpen] = React.useState(false)
  const isMobile = useIsMobile()
  const [draft, setDraft] = React.useState<
    { from?: Date; to?: Date } | undefined
  >()
  const min = parseISO(bounds.min.slice(0, 10))
  const max = parseISO(bounds.max.slice(0, 10))

  const label =
    preset === "custom" && range
      ? rangeLabel(range.from, range.to)
      : preset === "all"
        ? PRESET_LABELS.all
        : `${PRESET_LABELS[preset]}${range ? ` (to ${format(parseISO(range.to), "MMM d")})` : ""}`

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next)
          setDraft(
            range
              ? { from: parseISO(range.from), to: parseISO(range.to) }
              : undefined
          )
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(preset !== "all" && "border-primary/50")}
        >
          <CalendarIcon data-icon="inline-start" />
          {label}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex w-auto flex-col p-0 sm:flex-row"
      >
        <div className="flex flex-row flex-wrap gap-1 p-2 sm:flex-col">
          {QUICK.map((key) => (
            <Button
              key={key}
              size="sm"
              variant={preset === key ? "secondary" : "ghost"}
              className="justify-start"
              onClick={() => {
                onChange({ range: key, from: null, to: null })
                setOpen(false)
              }}
            >
              {PRESET_LABELS[key]}
            </Button>
          ))}
        </div>
        <Separator
          orientation={isMobile ? "horizontal" : "vertical"}
          className="sm:h-auto"
        />
        <div className="flex flex-col gap-2 p-2">
          <Calendar
            mode="range"
            numberOfMonths={isMobile ? 1 : 2}
            defaultMonth={draft?.from ?? max}
            startMonth={min}
            endMonth={max}
            disabled={{ before: min, after: max }}
            selected={
              draft?.from ? { from: draft.from, to: draft.to } : undefined
            }
            onSelect={(next) => setDraft(next ?? undefined)}
          />
          <div className="flex items-center justify-between gap-2 px-1 pb-1">
            <span className="text-xs text-muted-foreground">
              Data covers {format(min, "MMM d, yyyy")} to{" "}
              {format(max, "MMM d, yyyy")}
            </span>
            <Button
              size="sm"
              disabled={!draft?.from}
              onClick={() => {
                const from = format(draft!.from!, "yyyy-MM-dd")
                const to = format(draft!.to ?? draft!.from!, "yyyy-MM-dd")
                onChange({ range: "custom", from, to })
                setOpen(false)
              }}
            >
              Apply range
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
