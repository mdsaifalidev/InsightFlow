import type { Metadata } from "next"

import { ClosingCta } from "@/features/marketing/components/closing-cta"
import { GroundedAi } from "@/features/marketing/components/grounded-ai"
import { Hero } from "@/features/marketing/components/hero"
import { HowItWorks } from "@/features/marketing/components/how-it-works"
import { MoreViews } from "@/features/marketing/components/more-views"
import { LiveShowcase } from "@/features/marketing/components/live-showcase"
import { Speed } from "@/features/marketing/components/speed"

export const metadata: Metadata = {
  title: {
    absolute:
      "InsightFlow — a dashboard and a written brief from your spreadsheet",
  },
  description:
    "Upload a CSV or Excel export and get an interactive dashboard plus an AI brief where every number is computed from your data, never written by the model.",
  alternates: { canonical: "/" },
}

export default function LandingPage() {
  return (
    <>
      {/*
       * Band order, and the reason for it. The page alternates surfaces --
       * ink, panel, ink, canvas, panel, canvas, ink -- so scrolling has a
       * rhythm rather than seven ruled boxes of the same height. No two
       * neighbours share a tone: "Setup" and "What you get" used to, and the
       * join between them was invisible, so they are one band now.
       *
       * The proof band follows the hero with no seam (flushBottom into
       * flushTop): the hero makes a claim about a file, and the live components
       * immediately under it are that claim's evidence, so a gap between them
       * would break the argument in half. The Brief comes third because it is
       * the thing no competing product page has.
       */}
      <Hero />
      <LiveShowcase />
      <GroundedAi />
      <HowItWorks />
      <MoreViews />
      <Speed />
      <ClosingCta />
    </>
  )
}
