"use client"

import * as React from "react"
import { motion } from "motion/react"

import { FADE, RISE, VIEWPORT, group, useTiming } from "../motion"

/**
 * Rises into view once. The whole page's entrance vocabulary is this one
 * component, which is why the page reads as a single piece of design.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
  fade = false,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: "div" | "section" | "li" | "figure"
  /** Fade without moving. Use where the reader points at something inside. */
  fade?: boolean
}) {
  const { reveal } = useTiming()
  const Tag = motion[as]

  return (
    <Tag
      className={className}
      variants={fade ? FADE : RISE}
      initial="hidden"
      whileInView="shown"
      viewport={VIEWPORT}
      transition={{ ...reveal, delay }}
    >
      {children}
    </Tag>
  )
}

/**
 * Staggers its children. The children MUST NOT set their own whileInView:
 * Motion only propagates a variant to children that don't declare their own
 * trigger, so a child with whileInView fires off its own observer and the
 * stagger silently does nothing. Use RevealItem inside this.
 */
export function RevealGroup({
  children,
  className,
  step,
  as = "div",
}: {
  children: React.ReactNode
  className?: string
  step?: number
  as?: "div" | "ul" | "ol" | "dl"
}) {
  const { reveal } = useTiming()
  const Tag = motion[as]

  return (
    <Tag
      className={className}
      variants={group(step)}
      initial="hidden"
      whileInView="shown"
      viewport={VIEWPORT}
      transition={reveal}
    >
      {children}
    </Tag>
  )
}

/** A child of RevealGroup: variants only, so the parent drives the timing. */
export function RevealItem({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode
  className?: string
  as?: "div" | "li"
}) {
  const { reveal } = useTiming()
  const Tag = motion[as]

  return (
    <Tag className={className} variants={RISE} transition={reveal}>
      {children}
    </Tag>
  )
}
