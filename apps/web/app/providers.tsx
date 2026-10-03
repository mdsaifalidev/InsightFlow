"use client"

import * as React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { MotionConfig } from "motion/react"
import { NuqsAdapter } from "nuqs/adapters/next/app"
import { Toaster } from "@workspace/ui/components/sonner"
import { TooltipProvider } from "@workspace/ui/components/tooltip"

import { ThemeProvider } from "@/components/theme-provider"
import { ApiError } from "@/lib/api-client"
import { MSWBootstrap } from "@/mocks/msw-provider"

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Client errors (4xx) won't succeed on retry.
            retry: (failureCount, error) =>
              !(error instanceof ApiError && error.status < 500) &&
              failureCount < 2,
          },
        },
      })
  )

  return (
    // reducedMotion="user" disables transform and layout animations for
    // visitors who ask for it, while preserving opacity so content still
    // appears. Durations still come from useTiming() (features/marketing/motion.ts).
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <MSWBootstrap />
        <QueryClientProvider client={queryClient}>
          <NuqsAdapter>
            <TooltipProvider delayDuration={200}>{children}</TooltipProvider>
          </NuqsAdapter>
        </QueryClientProvider>
      </MotionConfig>
      <Toaster richColors closeButton />
    </ThemeProvider>
  )
}
