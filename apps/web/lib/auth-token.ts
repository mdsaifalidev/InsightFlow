// In-memory access token (never persisted, per ADR-007). The refresh token is
// an httpOnly cookie handled by the browser, so refreshing only needs a POST.

import type { RefreshResponse } from "@/lib/api/types"

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ""

let accessToken: string | null = null
let refreshInFlight: Promise<boolean> | null = null
const expiredListeners = new Set<() => void>()

export function getAccessToken() {
  return accessToken
}

export function setAccessToken(token: string | null) {
  accessToken = token
}

/** Called when the session can't be refreshed (e.g. to redirect to /login). */
export function onSessionExpired(listener: () => void) {
  expiredListeners.add(listener)
  return () => {
    expiredListeners.delete(listener)
  }
}

export function notifySessionExpired() {
  setAccessToken(null)
  expiredListeners.forEach((listener) => listener())
}

/** Single-flight refresh: concurrent 401s share one refresh request. */
export function refreshAccessToken(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${baseUrl}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) {
        setAccessToken(null)
        return false
      }
      const data = (await response.json()) as RefreshResponse
      setAccessToken(data.accessToken)
      return true
    } catch {
      setAccessToken(null)
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}
