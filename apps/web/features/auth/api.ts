"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { apiFetch } from "@/lib/api-client"
import type {
  AuthResponse,
  LoginRequest,
  MeResponse,
  RegisterRequest,
  UpdateMeRequest,
} from "@/lib/api/types"
import {
  getAccessToken,
  onSessionExpired,
  refreshAccessToken,
  setAccessToken,
} from "@/lib/auth-token"

export const meQueryKey = ["auth", "me"] as const

export function useAuthSession() {
  const [mounted, setMounted] = React.useState(false)
  const [isTokenActive, setIsTokenActive] = React.useState(false)
  const queryClient = useQueryClient()

  React.useEffect(() => {
    setMounted(true)
    if (getAccessToken() || Boolean(queryClient.getQueryData(meQueryKey))) {
      setIsTokenActive(true)
      return
    }

    let cancelled = false
    refreshAccessToken().then((ok) => {
      if (!cancelled) {
        setIsTokenActive(ok)
        if (ok) {
          queryClient.invalidateQueries({ queryKey: meQueryKey })
        }
      }
    })

    return () => {
      cancelled = true
    }
  }, [queryClient])

  React.useEffect(() => {
    return onSessionExpired(() => {
      setIsTokenActive(false)
    })
  }, [])

  const hasAccessToken = Boolean(getAccessToken())
  const hasQueryUser = Boolean(queryClient.getQueryData(meQueryKey))
  const isAuthenticated =
    mounted && (isTokenActive || hasAccessToken || hasQueryUser)

  return {
    mounted,
    isAuthenticated,
  }
}

export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    queryFn: () => apiFetch<MeResponse>("/api/auth/me"),
    staleTime: 5 * 60_000,
  })
}

function useSignedIn() {
  const queryClient = useQueryClient()
  return (data: AuthResponse) => {
    setAccessToken(data.accessToken)
    queryClient.setQueryData<MeResponse>(meQueryKey, {
      user: data.user,
      workspace: data.workspace,
    })
  }
}

export function useLogin() {
  const onSignedIn = useSignedIn()
  return useMutation({
    mutationFn: (body: LoginRequest) =>
      apiFetch<AuthResponse>("/api/auth/login", { method: "POST", body }),
    onSuccess: onSignedIn,
  })
}

export function useRegister() {
  const onSignedIn = useSignedIn()
  return useMutation({
    mutationFn: (body: RegisterRequest) =>
      apiFetch<AuthResponse>("/api/auth/register", { method: "POST", body }),
    onSuccess: onSignedIn,
  })
}

export function useLogout() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: () =>
      apiFetch<void>("/api/auth/logout", { method: "POST" }).catch(() => {
        // Signing out locally is still correct if the server call fails.
      }),
    onSettled: () => {
      setAccessToken(null)
      queryClient.clear()
      router.replace("/login")
    },
  })
}

export function useUpdateMe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpdateMeRequest) =>
      apiFetch<MeResponse>("/api/auth/me", { method: "PATCH", body }),
    onSuccess: (data) => queryClient.setQueryData(meQueryKey, data),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  const router = useRouter()
  return useMutation({
    mutationFn: () => apiFetch<void>("/api/auth/me", { method: "DELETE" }),
    onSuccess: () => {
      setAccessToken(null)
      queryClient.clear()
      router.replace("/register")
    },
  })
}
