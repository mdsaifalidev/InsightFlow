"use client"

import { motion, useScroll, useSpring } from "motion/react"

import { useTiming } from "../motion"

/**
 * How far down the page you are. Fixed, so it is nobody's ancestor — a
 * transform on an ancestor would kill the sticky header and make every
 * element under it unstable for Playwright.
 */
export function ScrollProgress() {
  const { instant } = useTiming()
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 180,
    damping: 30,
    restDelta: 0.001,
  })

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-primary/70"
      style={{ scaleX: instant ? scrollYProgress : scaleX }}
    />
  )
}
