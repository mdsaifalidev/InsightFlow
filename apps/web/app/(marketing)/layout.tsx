import * as React from "react"

import { SiteFooter } from "@/features/marketing/components/site-footer"
import { ScrollProgress } from "@/features/marketing/components/scroll-progress"
import { SiteHeader } from "@/features/marketing/components/site-header"

// The public face: no sidebar, no AuthGate. Signed-out visitors land here.
export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-svh min-w-0 flex-col bg-background">
      <ScrollProgress />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  )
}
