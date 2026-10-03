"use client"

import { useMutation, useQuery } from "@tanstack/react-query"

import { apiFetch } from "@/lib/api-client"
import type { Insight, RegenerateInsightResponse } from "@/lib/api/types"
import { trackJob } from "@/features/datasets/job-tracker"

export const insightKeys = {
  latest: (datasetId: string) => ["datasets", "insight", datasetId] as const,
}

export function useInsight(datasetId: string) {
  return useQuery({
    queryKey: insightKeys.latest(datasetId),
    queryFn: () =>
      apiFetch<Insight>(`/api/data/datasets/${datasetId}/insights/latest`),
  })
}

/** Starts a regeneration job; the job tracker reports completion. */
export function useRegenerateInsight(datasetId: string, datasetName: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<RegenerateInsightResponse>(
        `/api/data/datasets/${datasetId}/insights`,
        {
          method: "POST",
        }
      ),
    onSuccess: ({ jobId }) => {
      trackJob(jobId, { datasetId, name: datasetName, kind: "insight" })
    },
  })
}
