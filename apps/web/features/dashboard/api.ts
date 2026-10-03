"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type {
  DashboardResponse,
  Filters,
  QueryResponse,
  Widget,
  WidgetSpec,
} from "@/lib/api/types"

// Everything lives under ["datasets", ...] so ingest/insight job completion
// (which invalidates ["datasets"]) refreshes dashboards too.
export const dashboardKeys = {
  dashboard: (id: string) => ["datasets", "dashboard", id] as const,
  query: (id: string, body: unknown) =>
    ["datasets", "query", id, body] as const,
}

export function useDashboard(datasetId: string) {
  return useQuery({
    queryKey: dashboardKeys.dashboard(datasetId),
    queryFn: () =>
      apiFetch<DashboardResponse>(`/api/data/datasets/${datasetId}/dashboard`),
  })
}

/** One round trip for every widget + KPIs under the current filters (PRD F6). */
export function useDashboardQuery(
  datasetId: string,
  widgets: Widget[] | undefined,
  filters: Filters
) {
  const body = {
    widgets: (widgets ?? []).map((w) => ({ id: w.id, spec: w.spec })),
    kpis: true,
    filters,
  }
  return useQuery({
    queryKey: dashboardKeys.query(datasetId, body),
    queryFn: () =>
      apiFetch<QueryResponse>(`/api/data/datasets/${datasetId}/query`, {
        method: "POST",
        body,
      }),
    enabled: !!widgets,
    placeholderData: keepPreviousData,
  })
}

/** Live preview for the chart builder. */
export function usePreviewQuery(
  datasetId: string,
  spec: WidgetSpec | null,
  filters: Filters
) {
  const body = { widgets: spec ? [{ id: "preview", spec }] : [], filters }
  return useQuery({
    queryKey: dashboardKeys.query(datasetId, body),
    queryFn: () =>
      apiFetch<QueryResponse>(`/api/data/datasets/${datasetId}/query`, {
        method: "POST",
        body,
      }),
    enabled: !!spec,
    placeholderData: keepPreviousData,
  })
}

function useInvalidateDashboard(datasetId: string) {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      queryKey: dashboardKeys.dashboard(datasetId),
    })
}

export function useSaveWidget(datasetId: string) {
  const invalidate = useInvalidateDashboard(datasetId)
  return useMutation({
    mutationFn: ({
      widgetId,
      spec,
    }: {
      widgetId?: string
      spec: WidgetSpec
    }) =>
      widgetId
        ? apiFetch<Widget>(
            `/api/data/datasets/${datasetId}/widgets/${widgetId}`,
            {
              method: "PATCH",
              body: { spec },
            }
          )
        : apiFetch<Widget>(`/api/data/datasets/${datasetId}/widgets`, {
            method: "POST",
            body: { spec },
          }),
    onSuccess: invalidate,
  })
}

export function useDeleteWidget(datasetId: string) {
  const invalidate = useInvalidateDashboard(datasetId)
  return useMutation({
    mutationFn: (widgetId: string) =>
      apiFetch<void>(`/api/data/datasets/${datasetId}/widgets/${widgetId}`, {
        method: "DELETE",
      }),
    onSuccess: invalidate,
  })
}
