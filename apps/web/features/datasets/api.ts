"use client"

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type {
  ColumnType,
  DatasetColumn,
  DatasetDetail,
  DatasetList,
  SampleKey,
  UploadResponse,
} from "@/lib/api/types"
import { uploadFile } from "@/lib/upload"

import { trackJob } from "./job-tracker"

export type DatasetSort = "newest" | "name" | "rows"

export const datasetKeys = {
  all: ["datasets"] as const,
  list: (params: { q: string; sort: DatasetSort }) =>
    ["datasets", "list", params] as const,
  detail: (id: string) => ["datasets", "detail", id] as const,
}

export function useDatasets(params: { q: string; sort: DatasetSort }) {
  return useQuery({
    queryKey: datasetKeys.list(params),
    queryFn: () => {
      const search = new URLSearchParams({ sort: params.sort })
      if (params.q) search.set("q", params.q)
      return apiFetch<DatasetList>(`/api/data/datasets?${search}`)
    },
    placeholderData: keepPreviousData,
  })
}

export function useDataset(id: string) {
  return useQuery({
    queryKey: datasetKeys.detail(id),
    queryFn: () => apiFetch<DatasetDetail>(`/api/data/datasets/${id}`),
  })
}

function useStartedJob() {
  const queryClient = useQueryClient()
  return ({ dataset, jobId }: UploadResponse) => {
    trackJob(jobId, { datasetId: dataset.id, name: dataset.name })
    void queryClient.invalidateQueries({ queryKey: datasetKeys.all })
  }
}

export function useUploadDataset() {
  const onStarted = useStartedJob()
  return useMutation({
    mutationFn: ({
      file,
      name,
      onProgress,
    }: {
      file: File
      name: string
      onProgress?: (fraction: number | null) => void
    }) => {
      const form = new FormData()
      form.append("file", file)
      if (name.trim()) form.append("name", name.trim())
      return uploadFile<UploadResponse>("/api/data/datasets", form, {
        onProgress,
      })
    },
    onSuccess: onStarted,
  })
}

export function useCreateSample() {
  const onStarted = useStartedJob()
  return useMutation({
    mutationFn: (key: SampleKey) =>
      apiFetch<UploadResponse>("/api/data/datasets/sample", {
        method: "POST",
        body: { key },
      }),
    onSuccess: onStarted,
  })
}

export function useDeleteDataset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/api/data/datasets/${id}`, { method: "DELETE" }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: datasetKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: datasetKeys.all })
    },
  })
}

export function useOverrideColumnType(datasetId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      columnId,
      type,
    }: {
      columnId: string
      type: ColumnType | null
    }) =>
      apiFetch<DatasetColumn>(
        `/api/data/datasets/${datasetId}/columns/${columnId}`,
        { method: "PATCH", body: { type } }
      ),
    onSuccess: (column) => {
      queryClient.setQueryData<DatasetDetail>(
        datasetKeys.detail(datasetId),
        (detail) =>
          detail && {
            ...detail,
            columns: detail.columns.map((c) =>
              c.id === column.id ? column : c
            ),
          }
      )
    },
  })
}
