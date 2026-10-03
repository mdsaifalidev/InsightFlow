"use client"

// One SSE subscription per ingest job, shared by every component that shows
// its progress (upload dialog, library row, dataset page). Completion is
// reported once through the finished handler (toast + cache invalidation).

import * as React from "react"

import type { JobDoneEvent, JobProgressEvent, JobStage } from "@/lib/api/types"
import { streamEvents } from "@/lib/sse"

export type JobKind = "ingest" | "insight"

export type JobState = {
  jobId: string
  datasetId: string
  name: string
  kind: JobKind
  stage: JobStage
  progress: number
  message: string
  status: "running" | "ready" | "failed"
  errorMessage?: string
}

type JobMeta = { datasetId: string; name: string; kind?: JobKind }
type FinishedHandler = (state: JobState) => void

const states = new Map<string, JobState>()
const controllers = new Map<string, AbortController>()
const listeners = new Set<() => void>()
let finishedHandler: FinishedHandler | null = null

function set(jobId: string, patch: Partial<JobState>) {
  const current = states.get(jobId)
  if (!current) return
  // New object per change so useSyncExternalStore sees it.
  states.set(jobId, { ...current, ...patch })
  listeners.forEach((listener) => listener())
}

export function trackJob(jobId: string, meta: JobMeta) {
  if (controllers.has(jobId)) return
  const controller = new AbortController()
  controllers.set(jobId, controller)
  states.set(jobId, {
    jobId,
    ...meta,
    kind: meta.kind ?? "ingest",
    stage: "queued",
    progress: 0,
    message: "Waiting for a worker",
    status: "running",
  })
  listeners.forEach((listener) => listener())

  const isDone = () => states.get(jobId)?.status !== "running"
  void streamEvents(`/api/data/jobs/${jobId}/events`, {
    signal: controller.signal,
    isDone,
    onMessage: (message) => {
      if (message.event === "progress") {
        const data = JSON.parse(message.data) as JobProgressEvent
        set(jobId, {
          stage: data.stage,
          progress: data.progress,
          message: data.message,
        })
      } else if (message.event === "done") {
        const data = JSON.parse(message.data) as JobDoneEvent
        set(jobId, {
          stage: data.status,
          progress:
            data.status === "ready" ? 100 : (states.get(jobId)?.progress ?? 0),
          status: data.status,
          errorMessage: data.errorMessage,
        })
        controller.abort()
        const state = states.get(jobId)
        if (state) finishedHandler?.(state)
      }
    },
  })
}

export function setJobFinishedHandler(handler: FinishedHandler | null) {
  finishedHandler = handler
}

/** Stops all streams, e.g. on sign-out. */
export function stopAllJobs() {
  controllers.forEach((controller) => controller.abort())
  controllers.clear()
  states.clear()
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useJobState(jobId: string | null | undefined) {
  return React.useSyncExternalStore(
    subscribe,
    () => (jobId ? states.get(jobId) : undefined),
    () => undefined
  )
}
