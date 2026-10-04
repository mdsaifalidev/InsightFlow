"use client"

import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"

import { useAuthSession } from "@/features/auth/api"
import { Band } from "./band"
import { HeroTransform } from "./hero-transform"

// Seven words, two of them verbs, no adjectives. It keeps "Turn a spreadsheet
// into a dashboard" because the device below shows exactly that, and because
// e2e/landing.spec.ts and e2e/motion.spec.ts both match the heading by name.
// The brief claim moves to the subhead, where it is falsifiable, and the Brief
// band proves it.
const HEADLINE = "Turn a spreadsheet into a dashboard."

/**
 * Words carry their own animation delay so the headline arrives left to right.
 * Real whitespace between the spans, so the accessible name is still the whole
 * sentence — e2e/landing.spec.ts matches the heading by that name.
 */
function Headline() {
  return (
    <h1 className="font-serif text-display-xl text-balance">
      {HEADLINE.split(" ").map((word, i) => (
        <span key={`${word}-${i}`}>
          <span
            className="hero-word"
            style={{ "--i": i } as React.CSSProperties}
          >
            {word}
          </span>{" "}
        </span>
      ))}
    </h1>
  )
}

export function Hero() {
  const { isAuthenticated } = useAuthSession()

  return (
    <Band
      tone="ink"
      rhythm="openFlushBottom"
      width="wide"
      className="overflow-hidden"
      innerClassName="flex flex-col items-center gap-10 text-center"
      backdrop={
        /*
         * Ambient wash, across the whole band (under the header too). A
         * pointer-events-none sibling of the content, never an ancestor of
         * it: an infinite transform above a button would make Playwright's
         * actionability check spin until the test times out.
         */
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="hero-blob absolute -top-40 left-1/2 size-[42rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--primary),transparent_70%)] opacity-[0.16] blur-3xl" />
          <div className="hero-blob absolute -top-24 right-[12%] size-[26rem] rounded-full bg-[radial-gradient(circle,var(--chart-1),transparent_70%)] opacity-[0.12] blur-3xl [animation-delay:-8s]" />
        </div>
      }
    >
      <div className="flex max-w-3xl flex-col items-center gap-6">
        <Headline />
        <p
          className="hero-enter max-w-2xl text-subhead text-pretty text-muted-foreground"
          style={{ "--enter-delay": "160ms" } as React.CSSProperties}
        >
          Drop in a CSV or Excel export, up to 100&nbsp;MB. InsightFlow profiles
          every column, builds the charts, and writes a brief in which every
          number is computed — not generated.
        </p>
      </div>

      <div
        className="hero-enter flex flex-col items-center gap-3 sm:flex-row sm:items-start"
        style={{ "--enter-delay": "240ms" } as React.CSSProperties}
      >
        {isAuthenticated ? (
          <Button asChild className="h-11 px-6 text-base">
            <Link href="/app">
              Open app
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          </Button>
        ) : (
          <>
            <Button asChild className="h-11 px-6 text-base">
              <Link href="/register">
                Create an account
                <ArrowRightIcon data-icon="inline-end" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-11 px-6 text-base">
              <Link href="/login">Sign in</Link>
            </Button>
          </>
        )}
      </div>

      {/* The best sentence on the page, and it was a 12px pill with a 6px dot.
          Now a line of its own under the buttons, where it answers the question
          the buttons just raised. */}
      <p
        className="hero-enter flex items-center gap-2 text-body-sm text-muted-foreground"
        style={{ "--enter-delay": "300ms" } as React.CSSProperties}
      >
        <span aria-hidden className="size-1.5 rounded-full bg-signal" />
        Every number is computed, never written by the AI
      </p>

      {/* Below the fold, which is what lets it animate in CSS without touching
          the LCP element above it. */}
      <HeroTransform />
    </Band>
  )
}
