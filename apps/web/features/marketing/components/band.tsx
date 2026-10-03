import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

/**
 * One horizontal band of the landing page.
 *
 * The page it replaced was eight sections of `max-w-6xl py-16 border-b`, so
 * seven of the eight measured between 510 and 761px tall and the reader's eye
 * learned the pattern by the third one. A band therefore declares three things
 * the old sections could not vary: its surface, its vertical rhythm, and its
 * width.
 *
 * TONE is two cooperating mechanisms, and neither works alone:
 *
 *   `dark` (a literal class, because the `dark:` variant needs one in the DOM)
 *     gives an ink band the correct token VALUES in either theme. Verified in
 *     the browser: --signal resolves to the dark amber, --chart-* to the
 *     dark-validated steps, and AppFrame's `dark:hidden` / `hidden dark:block`
 *     swap picks the dark capture with no code change. Nested inside .dark it is
 *     a clean no-op -- which is exactly why it cannot supply contrast on its own
 *     when the whole page is already dark.
 *
 *   `data-tone` re-points the surface tokens for everything inside, so adjacent
 *     bands differ in BOTH themes. The CSS lives in packages/ui globals.css.
 *
 * Two rules come with it. Charts must sit on --card, never straight on a band
 * background: the dark chart palette was validated against --surface-raised, and
 * --surface-ink is outside what the checker signed off. And a Band must never
 * appear inside app/app/*, or `pnpm --filter web shots` would capture forced-dark
 * surfaces in its light project.
 *
 * Note for anyone editing: never put a `dark:` variant ON a Band element. That
 * variant matches descendants of .dark, and the band IS the .dark. Unprefixed
 * utilities read the band's own values and work fine; inside the band, both do.
 */

const RHYTHM = {
  /** 64px — evidence that should feel dense. */
  tight: "py-16",
  /** 112px — the default. */
  normal: "py-20 sm:py-28",
  /** 176px — for the two or three bands that carry the argument. */
  wide: "py-24 sm:py-44",
  /** Continues the band above with no seam: they read as one thought. */
  flushTop: "pt-0 pb-20 sm:pb-28",
  /** Runs into the band below. */
  flushBottom: "pt-20 pb-0 sm:pt-28",
  /**
   * Same, but for the FIRST band on the page.
   *
   * The -mt-14 pulls it up under the h-14 sticky header, and the padding adds
   * that 56px back, so the visual gap below the header is unchanged (32/48px).
   * Sliding under matters because the band paints its own background and its
   * ambient glow: leaving it below the header meant the glow was clipped at the
   * header line and stopped dead there, which is half of why the seam showed.
   * The header is z-40 and this band only creates a stacking context, so the
   * header still draws on top.
   */
  openFlushBottom: "-mt-14 pt-22 pb-0 sm:pt-26",
} as const

const WIDTH = {
  /** 42rem — centred closing statements. */
  prose: "max-w-2xl",
  /** 64rem — reading-width argument with room for one figure. */
  content: "max-w-5xl",
  /** 72rem — product surfaces and grids. */
  wide: "max-w-6xl",
  /** The band manages its own width (a stage that bleeds off the edge). */
  full: "max-w-none",
} as const

export type BandTone = "ink" | "canvas" | "panel"

export function Band({
  tone,
  rhythm = "normal",
  width = "wide",
  id,
  labelledBy,
  className,
  innerClassName,
  backdrop,
  children,
}: {
  tone: BandTone
  rhythm?: keyof typeof RHYTHM
  width?: keyof typeof WIDTH
  id?: string
  labelledBy?: string
  className?: string
  innerClassName?: string
  /**
   * Ambient decoration painted across the WHOLE band, padding included. It
   * cannot live in `children`: the inner column is `relative` and width-capped,
   * so an `absolute inset-0` wash there starts below the top padding and stops
   * at the column edges -- the hero glow ended in a hard line right where the
   * headline begins.
   */
  backdrop?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      data-tone={tone}
      className={cn(
        tone === "ink" && "dark",
        // text-foreground is not optional: without it an ink band in the light
        // theme inherits the page's ink-on-paper foreground onto a dark surface.
        // isolate keeps ambient decoration from escaping the band.
        "relative isolate bg-background text-foreground",
        id && "scroll-mt-16",
        // A hairline at the join. The dark ladder moves 2-6 RGB points per
        // step by design -- ink->canvas is 0.026 in OKLab L, the same as
        // canvas->panel -- so in dark mode the tonal change alone is too
        // quiet to mark where one argument ends and the next begins, and the
        // page scans as one long sheet. Widening the ladder was the other
        // option and was rejected: --surface-panel and --surface-raised are
        // the surfaces the chart palette was validated against, so they
        // cannot move, and lifting only the ends would make the rungs uneven.
        // A rule costs nothing and is the honest instrument-panel answer.
        //
        // Not drawn on a flush rhythm: flushTop continues the band above as
        // one thought, and openFlushBottom is the first band on the page,
        // which has the header above it rather than another band.
        rhythm !== "flushTop" &&
          rhythm !== "openFlushBottom" &&
          "border-t border-border-soft",
        RHYTHM[rhythm],
        className
      )}
    >
      {backdrop}
      {/* min-w-0: wide content (a chart, a table of raw rows) has to scroll
          inside its own box rather than widening the page at 375px. */}
      <div
        className={cn(
          "relative mx-auto w-full min-w-0 px-5 sm:px-6",
          WIDTH[width],
          innerClassName
        )}
      >
        {children}
      </div>
    </section>
  )
}

/**
 * The small tracked label above a headline. The feature name lives here so the
 * headline is free to assert something — the template inversion is a headline
 * that names the feature and an eyebrow that decorates.
 */
export function Eyebrow({
  children,
  className,
  style,
}: {
  children: React.ReactNode
  className?: string
  /** For the hero's CSS entrance delay (--enter-delay). */
  style?: React.CSSProperties
}) {
  return (
    <p
      style={style}
      className={cn("text-eyebrow text-muted-foreground", className)}
    >
      {children}
    </p>
  )
}
