"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Switch } from "@workspace/ui/components/switch"
import { toast } from "sonner"

import { apiFetch } from "@/lib/api-client"
import { authMode } from "@/lib/backend-mode"
import { setAccessToken } from "@/lib/auth-token"

import { SettingsSection } from "./settings-section"

type MockSettings = { latencyMs: number; failNextUpload: boolean }

const serviceAuth = authMode === "service"

const LATENCIES = [
  { value: 0, label: "None (instant)" },
  { value: 250, label: "Typical (250 ms)" },
  { value: 800, label: "Slow network (800 ms)" },
]

/** Demo-only controls, backed by mock endpoints (mocks/handlers/mock.ts). */
export function MockControls() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const settings = useQuery({
    queryKey: ["mock", "settings"],
    queryFn: () => apiFetch<MockSettings>("/api/mock/settings"),
  })
  const update = useMutation({
    mutationFn: (patch: Partial<MockSettings>) =>
      apiFetch<MockSettings>("/api/mock/settings", {
        method: "PATCH",
        body: patch,
      }),
    onSuccess: (data) => queryClient.setQueryData(["mock", "settings"], data),
  })
  const reset = useMutation({
    mutationFn: () => apiFetch<void>("/api/mock/reset", { method: "POST" }),
    onSuccess: () => {
      toast.success("Demo data reset")
      if (serviceAuth) {
        // Only mock data was cleared; the real session is still valid.
        void queryClient.invalidateQueries()
        router.replace("/app/datasets")
        return
      }
      setAccessToken(null)
      queryClient.clear()
      router.replace("/register")
    },
  })

  return (
    <SettingsSection
      id="settings-demo"
      title="Demo controls"
      description="The app is running against an in-browser mock backend. These settings only affect this browser."
    >
      <FieldGroup>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="mock-latency">Simulated latency</FieldLabel>
            <FieldDescription>
              Also sets how long processing steps take.
            </FieldDescription>
          </FieldContent>
          <Select
            value={settings.data ? String(settings.data.latencyMs) : undefined}
            onValueChange={(v) => update.mutate({ latencyMs: Number(v) })}
            disabled={!settings.data}
          >
            <SelectTrigger id="mock-latency" className="w-52">
              <SelectValue placeholder="Loading" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {LATENCIES.map((l) => (
                  <SelectItem key={l.value} value={String(l.value)}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor="mock-fail">Fail the next upload</FieldLabel>
            <FieldDescription>
              Shows the error states: the next upload or sample stops while
              reading rows.
            </FieldDescription>
          </FieldContent>
          <Switch
            id="mock-fail"
            checked={settings.data?.failNextUpload ?? false}
            disabled={!settings.data}
            onCheckedChange={(checked) =>
              update.mutate({ failNextUpload: checked })
            }
          />
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel>Reset demo data</FieldLabel>
            <FieldDescription>
              {serviceAuth
                ? "Removes the mock datasets and dashboards stored in this browser. Your account lives in the auth service and isn't affected."
                : "Removes every account and dataset stored in this browser."}
            </FieldDescription>
          </FieldContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">Reset</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all demo data?</AlertDialogTitle>
                <AlertDialogDescription>
                  {serviceAuth
                    ? "Every mock dataset and dashboard in this browser is removed. You stay signed in."
                    : "Every mock account, dataset and dashboard in this browser is removed, and you're signed out."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => reset.mutate()}
                >
                  Reset demo data
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Field>
      </FieldGroup>
    </SettingsSection>
  )
}
