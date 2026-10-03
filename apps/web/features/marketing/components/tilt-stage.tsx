"use client"

import * as React from "react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"

import { useTiming } from "../motion"

const MAX_DEGREES = 5

/**
 * Tilts its child toward the pointer. Used only inside the hero, which is the
 * one section that clips horizontally — a rotation widens the element's box,
 * and e2e/landing.spec.ts asserts the page never scrolls sideways at 375px.
 *
 * Always renders the same tree. Branching on useReducedMotion() would emit one
 * structure on the server and another at hydration, and React 19 would discard
 * the server render — taking the priority hero <Image> with it, which is the
 * exact LCP regression the CSS hero exists to avoid. Reduced motion is applied
 * by never moving the values instead.
 */
export function TiltStage({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { settle, instant } = useTiming()
  const px = useMotionValue(0)
  const py = useMotionValue(0)

  const rotateX = useSpring(
    useTransform(py, [-0.5, 0.5], [MAX_DEGREES, -MAX_DEGREES]),
    settle
  )
  const rotateY = useSpring(
    useTransform(px, [-0.5, 0.5], [-MAX_DEGREES, MAX_DEGREES]),
    settle
  )

  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    // Coarse pointers have no hover, and a reduced-motion visitor asked not to.
    if (instant || event.pointerType !== "mouse") return
    const box = event.currentTarget.getBoundingClientRect()
    px.set((event.clientX - box.left) / box.width - 0.5)
    py.set((event.clientY - box.top) / box.height - 0.5)
  }

  const recenter = () => {
    px.set(0)
    py.set(0)
  }

  return (
    <div
      className={className}
      style={{ perspective: 1600 }}
      onPointerMove={onMove}
      onPointerLeave={recenter}
    >
      <motion.div style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}>
        {children}
      </motion.div>
    </div>
  )
}
