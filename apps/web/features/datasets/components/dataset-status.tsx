"use client"

import * as React from "react"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import type { Dataset } from "@/lib/api/types"

import { INGEST_STAGES } from "../constants"
import { trackJob, useJobState } from "../job-tracker"

/** Subscribes to a dataset's job while it is still processing. */
export function useDatasetJob(
  dataset: Pick<Dataset, "id" | "name" | "status" | "jobId">
) {
  const inFlight =
    dataset.status === "queued" || dataset.status === "processing"
  React.useEffect(() => {
    if (inFlight && dataset.jobId) {
      trackJob(dataset.jobId, { datasetId: dataset.id, name: dataset.name })
    }
  }, [inFlight, dataset.jobId, dataset.id, dataset.name])
  return useJobState(inFlight ? dataset.jobId : null)
}

/**
 * Status as a dot and a word, not a pill: it is metadata beside a title, and a
 * filled badge out-shouted the name it was describing.
 */
export function DatasetStatusBadge({ dataset }: { dataset: Dataset }) {
  const job = useDatasetJob(dataset)
  const base =
    "inline-flex shrink-0 items-center gap-1.5 text-xs font-medium whitespace-nowrap"

  if (dataset.status === "ready")
    return (
      <span className={cn(base, "text-muted-foreground")}>
        <span className="size-1.5 rounded-full bg-up" aria-hidden />
        Ready
      </span>
    )
  if (dataset.status === "failed")
    return (
      <span className={cn(base, "text-destructive")}>
        <span className="size-1.5 rounded-full bg-destructive" aria-hidden />
        Failed
      </span>
    )
  return (
    <span className={cn(base, "text-muted-foreground")}>
      <Spinner className="size-3" />
      {job?.stage && job.stage !== "queued" ? "Processing" : "Queued"}
    </span>
  )
}

/** Compact progress for list rows while a dataset is processing. */
export function DatasetInlineProgress({ dataset }: { dataset: Dataset }) {
  const job = useDatasetJob(dataset)
  if (dataset.status !== "queued" && dataset.status !== "processing")
    return null
  // Once the job finishes, the list refetches; show nothing in between rather
  // than a stale or fallback stage label.
  if (job && job.status !== "running") return null
  const label =
    INGEST_STAGES.find((s) => s.stage === job?.stage)?.label ?? "Queued"
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <Progress
        value={job?.progress ?? 0}
        className="h-1"
        aria-label={`${dataset.name} progress`}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
