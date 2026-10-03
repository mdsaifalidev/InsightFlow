"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { FilterValuesResponse } from "@/lib/api/types"

export function useFilterValues(
  datasetId: string,
  column: string | null,
  q: string
) {
  return useQuery({
    queryKey: ["datasets", "filter-values", datasetId, column, q],
    queryFn: () =>
      apiFetch<FilterValuesResponse>(
        `/api/data/datasets/${datasetId}/filters/${encodeURIComponent(column!)}/values${q ? `?q=${encodeURIComponent(q)}` : ""}`
      ),
    enabled: !!column,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}
