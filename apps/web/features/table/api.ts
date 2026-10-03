"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { Filters, RowsResponse } from "@/lib/api/types"

export function useRows(
  datasetId: string,
  params: {
    page: number
    pageSize: number
    sort: string | null
    filters: Filters
  }
) {
  const search = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
  })
  if (params.sort) search.set("sort", params.sort)
  if (params.filters.dateRange || params.filters.where?.length) {
    search.set("filters", JSON.stringify(params.filters))
  }
  const path = `/api/data/datasets/${datasetId}/rows?${search}`
  return useQuery({
    queryKey: ["datasets", "rows", datasetId, path],
    queryFn: () => apiFetch<RowsResponse>(path),
    placeholderData: keepPreviousData,
  })
}
