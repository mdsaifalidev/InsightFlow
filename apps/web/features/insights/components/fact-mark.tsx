"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

type FactMarkProps = {
  children: React.ReactNode
  active?: boolean
  onActiveChange?: (active: boolean) => void
  className?: string
  /** Accessible description of what the number refers to. */
  label?: string
}

/**
 * A number in a Brief that is backed by a computed fact. Hovering or focusing
 * it highlights the matching mark on its chart — the visible half of the
 * "numbers come from the data, never the LLM" rule (ADR-010).
 */
export function FactMark({
  children,
  active,
  onActiveChange,
  className,
  label,
}: FactMarkProps) {
  return (
    <span
      tabIndex={0}
      aria-label={label}
      data-active={active || undefined}
      onPointerEnter={() => onActiveChange?.(true)}
      onPointerLeave={() => onActiveChange?.(false)}
      onFocus={() => onActiveChange?.(true)}
      onBlur={() => onActiveChange?.(false)}
      className={cn(
        // The surrounding face, not a switch to bold sans: in the serif lead a
        // sans number read as a different voice. Lining + tabular figures keep
        // it a figure (Newsreader defaults to old-style).
        "cursor-default rounded-[3px] px-[0.2em] font-semibold whitespace-nowrap [font-variant-numeric:lining-nums_tabular-nums]",
        "bg-signal/12 text-foreground shadow-[inset_0_-1.5px_0_var(--signal)]",
        "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "data-[active]:bg-signal/30",
        className
      )}
    >
      {children}
    </span>
  )
}
