"use client"

import { Separator } from "@workspace/ui/components/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@workspace/ui/components/sidebar"

import { ThemeToggle } from "@/components/theme-toggle"
import { JobTrackerBridge } from "@/features/datasets/components/job-tracker-bridge"

import { AppSidebar } from "./app-sidebar"
import { BreadcrumbProvider, HeaderBreadcrumbs } from "./breadcrumbs"

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <BreadcrumbProvider>
      <JobTrackerBridge />
      <SidebarProvider>
        <AppSidebar />
        {/* min-w-0: wide content (tables) must scroll inside, not widen the page. */}
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border-soft bg-surface-canvas/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-surface-canvas/80 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-1 data-[orientation=vertical]:h-4"
            />
            <HeaderBreadcrumbs />
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </header>
          <div className="flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </BreadcrumbProvider>
  )
}
