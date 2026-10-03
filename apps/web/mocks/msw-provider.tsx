"use client"

import * as React from "react"

import { mswEnabled as mockingEnabled } from "@/lib/backend-mode"

let workerStart: Promise<unknown> | null = null

/** Single-flight: calling this repeatedly is free. */
export function startWorker() {
  if (!mockingEnabled) return Promise.resolve()
  workerStart ??= import("./browser").then(({ worker }) =>
    worker.start({ onUnhandledRequest: "bypass", quiet: false })
  )
  return workerStart
}

/**
 * Begins registering the worker on first paint of any route, so a visitor who
 * arrives on a marketing page has it ready before they reach the app. Renders
 * nothing and never withholds children.
 */
export function MSWBootstrap() {
  React.useEffect(() => {
    void startWorker()
  }, [])
  return null
}

/**
 * Holds rendering until the worker is active, so the first requests of the
 * subtree below are already intercepted. Mounted by the layouts that fetch
 * (`/app/*` and the auth pages) — not at the root, where it would blank the
 * marketing pages while the worker boots.
 */
export function MSWProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = React.useState(!mockingEnabled)

  React.useEffect(() => {
    if (!mockingEnabled) return
    startWorker().then(() => setReady(true))
  }, [])

  if (!ready) return null
  return <>{children}</>
}
