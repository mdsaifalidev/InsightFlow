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

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  "https://useinsightflow.vercel.app"

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "InsightFlow",
      description:
        "Turn spreadsheets into interactive dashboards and grounded AI executive summaries.",
      publisher: {
        "@type": "Organization",
        name: "InsightFlow",
        logo: {
          "@type": "ImageObject",
          url: `${siteUrl}/icon.svg`,
        },
      },
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${siteUrl}/#software`,
      name: "InsightFlow",
      applicationCategory: "BusinessApplication",
      operatingSystem: "All (Web Browser)",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      description:
        "Upload a CSV or Excel export and get an interactive dashboard plus an AI executive brief where every metric is mathematically grounded in your data.",
      featureList: [
        "Instant CSV & Excel dataset parsing",
        "Automatic schema inference and data profiling",
        "Interactive KPI metric tiles and charts",
        "Sub-second analytics powered by Apache Arrow & Polars",
        "Grounded AI executive brief with clickable FactMarks",
        "Automated anomaly detection and trend analysis",
      ],
      screenshot: `${siteUrl}/opengraph-image`,
    },
  ],
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

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
