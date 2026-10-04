import type { Metadata } from "next"
import { Instrument_Sans, Newsreader } from "next/font/google"

import "@workspace/ui/globals.css"
import { cn } from "@workspace/ui/lib/utils"

import { Providers } from "./providers"

// Instrument Sans for the interface (tabular figures for data); Newsreader is
// reserved for the written Brief.
const fontSans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
})

const fontSerif = Newsreader({
  subsets: ["latin"],
  variable: "--font-serif",
  style: ["normal", "italic"],
})

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : undefined) ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ||
  "https://useinsightflow.vercel.app"

const description =
  "Turn spreadsheets into interactive dashboards and grounded AI executive summaries. Upload CSV or Excel files with sub-second queries and automated anomaly detection."

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "InsightFlow — AI Business Analytics & Interactive Dashboards",
    template: "%s | InsightFlow",
  },
  description,
  keywords: [
    "AI analytics",
    "business intelligence",
    "interactive dashboard",
    "CSV analytics",
    "Excel visualization",
    "anomaly detection",
    "AI executive summary",
    "data storytelling",
    "Polars analytics",
    "FastAPI analytics",
    "InsightFlow",
  ],
  authors: [{ name: "InsightFlow", url: siteUrl }],
  creator: "InsightFlow",
  publisher: "InsightFlow",
  category: "technology",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: "InsightFlow",
    title: "InsightFlow — AI Business Analytics & Interactive Dashboards",
    description,
    url: siteUrl,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "InsightFlow — AI Business Analytics from Spreadsheets",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "InsightFlow — AI Business Analytics & Interactive Dashboards",
    description,
    images: ["/opengraph-image"],
    creator: "@insightflow",
  },
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontSans.variable,
        fontSerif.variable,
        "font-sans"
      )}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
