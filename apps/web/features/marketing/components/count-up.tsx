"use client"

import * as React from "react"
import { animate, useInView } from "motion/react"

import { useTiming } from "../motion"

/**
 * Counts to a value once, in view, and lands on exactly it.
 *
 * A count-up is neither a transform nor a layout animation, so MotionConfig's
 * reduced-motion handling does not cover it — hence the explicit `instant`
 * check. The final frame always calls `format(value)`, so the number on screen
 * is the number the engine computed, never a rounded approximation of it.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const { instant } = useTiming()
  const ref = React.useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })

  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    if (instant || !inView) {
      node.textContent = format(value)
      return
    }
    const controls = animate(0, value, {
      duration: 1.1,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (n) => {
        node.textContent = format(n)
      },
      onComplete: () => {
        node.textContent = format(value)
      },
    })
    return () => controls.stop()
  }, [inView, instant, value, format])

  // Server-rendered with the final value: the real number is in the HTML even
  // if JavaScript never runs.
  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  )
}
