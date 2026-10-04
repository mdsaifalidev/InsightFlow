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

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
const description =
  "Turn raw business data into interactive dashboards and grounded AI insights."

export const metadata: Metadata = {
  // Absolute URLs for OpenGraph; set NEXT_PUBLIC_SITE_URL per deployment.
  metadataBase: new URL(siteUrl),
  title: { default: "InsightFlow", template: "%s | InsightFlow" },
  description,
  openGraph: {
    type: "website",
    siteName: "InsightFlow",
    title: "InsightFlow",
    description,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "InsightFlow", description },
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
