"use client"

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { Spinner } from "@workspace/ui/components/spinner"

import {
  getAccessToken,
  onSessionExpired,
  refreshAccessToken,
} from "@/lib/auth-token"

/**
 * Client-side route protection for /app/*: restores the session with a silent
 * refresh, otherwise redirects to /login?next=… . (A server-side proxy.ts
 * check on the refresh cookie is added with the real auth service.)
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [status, setStatus] = React.useState<"checking" | "ok">(() =>
    getAccessToken() ? "ok" : "checking"
  )

  const toLogin = React.useCallback(() => {
    router.replace(`/login?next=${encodeURIComponent(pathname)}`)
  }, [router, pathname])

  React.useEffect(() => {
    if (status === "ok") return
    let cancelled = false
    refreshAccessToken().then((ok) => {
      if (cancelled) return
      if (ok) setStatus("ok")
      else toLogin()
    })
    return () => {
      cancelled = true
    }
  }, [status, toLogin])

  React.useEffect(() => onSessionExpired(toLogin), [toLogin])

  if (status !== "ok") {
    return (
      <div
        className="flex min-h-svh items-center justify-center"
        role="status"
        aria-label="Restoring your session"
      >
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    )
  }
  return <>{children}</>
}

/** On /login and /register: skip the form when a session already exists. */
export function useRedirectIfSignedIn(to: string) {
  const router = useRouter()
  React.useEffect(() => {
    let cancelled = false
    refreshAccessToken().then((ok) => {
      if (ok && !cancelled) router.replace(to)
    })
    return () => {
      cancelled = true
    }
  }, [router, to])
}
