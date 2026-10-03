"use client"

import { useReducedMotion, type Transition, type Variants } from "motion/react"

/**
 * The motion system. Four tokens, deliberately few: a page reads as designed
 * when everything moves the same way, and as decorated when each thing invents
 * its own timing.
 *
 * Nothing here branches on reduced motion structurally — the hook returns null
 * on the server and a boolean on the client, so a structural branch would
 * change the tree between SSR and hydration and React 19 would throw the
 * server render away. Reduced motion only ever changes VALUES.
 */

/** Entrances: fast out of the gate, long tail. Feels like it settles, not stops. */
export const REVEAL_EASE = [0.16, 1, 0.3, 1] as const
export const REVEAL_MS = 0.5

/** Pointer-driven motion. Critically damped enough not to wobble. */
export const SETTLE: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 30,
  restDelta: 0.001,
}

/** The single reveal shape: 16px is enough to notice, little enough to ignore. */
export const RISE: Variants = {
  hidden: { opacity: 0, y: 16 },
  shown: { opacity: 1, y: 0 },
}

/**
 * Opacity only. For sections holding something the reader points at: a reveal
 * that moves the target between hit-test and click is annoying for a person
 * and flaky for Playwright.
 */
export const FADE: Variants = {
  hidden: { opacity: 0 },
  shown: { opacity: 1 },
}

/** Three is where a stagger stops reading as rhythm and starts reading as a wait. */
export const STAGGER_S = 0.06

/** Only observe once: the suites scroll back up, and a replaying entrance is a moving click target. */
export const VIEWPORT = { once: true, amount: 0.25 } as const

export type Timing = {
  /** Transition for entrances. Zero-duration when motion is reduced. */
  reveal: Transition
  /** Transition for pointer-driven motion. */
  settle: Transition
  /**
   * True when the visitor asked for reduced motion. Read this for effects
   * MotionConfig does NOT cover — count-ups and clip-path draws are neither
   * transform nor layout, so they keep running unless we stop them.
   */
  instant: boolean
}

export function useTiming(): Timing {
  const reduced = useReducedMotion()
  const instant = reduced === true
  return {
    reveal: { duration: instant ? 0 : REVEAL_MS, ease: [...REVEAL_EASE] },
    settle: instant ? { duration: 0 } : SETTLE,
    instant,
  }
}

/** Parent of a staggered group. Children take `variants={RISE}` and nothing else. */
export function group(step = STAGGER_S): Variants {
  return {
    hidden: {},
    shown: { transition: { staggerChildren: step } },
  }
}
