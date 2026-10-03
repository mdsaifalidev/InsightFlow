"use client"

import * as React from "react"
import { motion, useInView } from "motion/react"
import { cn } from "@workspace/ui/lib/utils"

import { useTiming } from "../motion"

/**
 * Sweeps its child into view left to right.
 *
 * Implemented as an animated clip-path on a wrapper rather than by enabling
 * Recharts' own animation: chart animation is disabled project-wide so golden
 * fixtures and product screenshots stay deterministic, and this keeps that
 * true. clip-path is not a transform, so it needs the explicit `instant` check.
 */
export function DrawIn({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { instant } = useTiming()
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.4 })
  const done = instant || inView

  return (
    // min-w-0 on both: Recharts' ResponsiveContainer measures its parent, and
    // a wrapper that can't shrink lets the chart widen the whole page on
    // resize (the flex/grid min-width:auto default — see CLAUDE.md).
    <div ref={ref} className={cn("w-full min-w-0", className)}>
      <motion.div
        className="w-full min-w-0"
        initial={false}
        animate={{ clipPath: done ? "inset(0 0% 0 0)" : "inset(0 100% 0 0)" }}
        transition={{ duration: instant ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>
  )
}
