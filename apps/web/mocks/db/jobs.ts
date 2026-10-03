// Mock ingest pipeline: a timed state machine that does the real parse and
// profile work, and publishes progress the way the ARQ worker will via Redis
// pub/sub (ARCHITECTURE §3.2).

import type {
  DatasetColumn,
  JobDoneEvent,
  JobProgressEvent,
  JobStage,
} from "@/lib/api/types"

import { detectDateColumn, profileTable } from "./engine/profile"
import { parseFile, ParseError } from "./engine/parse"
import { loadUploadBlob, saveRows } from "./rows"
import { samples } from "./samples"
import {
  db,
  mutate,
  newId,
  nowIso,
  type StoredDataset,
  type StoredJob,
} from "./store"
import type { ParsedTable } from "./types"

export type JobEvent =
  | { type: "progress"; id: number; data: JobProgressEvent }
  | { type: "done"; id: number; data: JobDoneEvent }

type StageDef = {
  stage: JobStage
  from: number
  to: number
  ms: number
  message: string
}

const STAGES: StageDef[] = [
  { stage: "queued", from: 2, to: 5, ms: 500, message: "Waiting for a worker" },
  { stage: "parsing", from: 8, to: 35, ms: 1400, message: "Reading rows" },
  {
    stage: "profiling",
    from: 40,
    to: 60,
    ms: 1100,
    message: "Profiling columns",
  },
  {
    stage: "building_dashboard",
    from: 65,
    to: 80,
    ms: 800,
    message: "Choosing charts",
  },
  {
    stage: "generating_insight",
    from: 85,
    to: 97,
    ms: 1500,
    message: "Writing the brief",
  },
]

/** Checkpoint C hooks these to build widgets and insights. */
export const pipelineHooks: {
  buildDashboard?: (dataset: StoredDataset) => Promise<void>
  generateInsight?: (dataset: StoredDataset) => Promise<void>
} = {}

const subscribers = new Map<string, Set<(event: JobEvent) => void>>()
const running = new Set<string>()
const sequence = new Map<string, number>()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function scaled(ms: number) {
  // Stage timing follows the mock latency setting (0 in tests).
  return Math.round(ms * (db().settings.latencyMs / 250))
}

function nextId(jobId: string) {
  const id = (sequence.get(jobId) ?? 0) + 1
  sequence.set(jobId, id)
  return id
}

function emit(jobId: string, event: Omit<JobEvent, "id">) {
  const full = { ...event, id: nextId(jobId) } as JobEvent
  subscribers.get(jobId)?.forEach((listener) => listener(full))
}

export function subscribe(jobId: string, listener: (event: JobEvent) => void) {
  const set = subscribers.get(jobId) ?? new Set()
  set.add(listener)
  subscribers.set(jobId, set)
  return () => {
    set.delete(listener)
  }
}

export function currentEvent(job: StoredJob): JobEvent {
  const id = sequence.get(job.id) ?? 0
  if (job.stage === "ready" || job.stage === "failed") {
    return {
      type: "done",
      id,
      data: {
        jobId: job.id,
        datasetId: job.datasetId,
        status: job.stage,
        ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
      },
    }
  }
  const def = STAGES.find((s) => s.stage === job.stage)
  return {
    type: "progress",
    id,
    data: {
      jobId: job.id,
      stage: job.stage,
      progress: job.progress,
      message: def?.message ?? "",
    },
  }
}

function update(jobId: string, patch: Partial<StoredJob>) {
  return mutate((s) => {
    const job = s.jobs.find((j) => j.id === jobId)
    if (job) Object.assign(job, patch)
    return job
  })
}

function updateDataset(datasetId: string, patch: Partial<StoredDataset>) {
  mutate((s) => {
    const dataset = s.datasets.find((d) => d.id === datasetId)
    if (dataset) Object.assign(dataset, patch)
  })
}

async function loadTable(dataset: StoredDataset): Promise<ParsedTable> {
  if (dataset.source.kind === "sample")
    return samples[dataset.source.key].generate()
  const blob = await loadUploadBlob(dataset.source.blobKey)
  if (!blob)
    throw new ParseError(
      "The uploaded file is no longer available. Upload it again."
    )
  return parseFile(blob, dataset.fileType)
}

async function runStage(
  job: StoredJob,
  def: StageDef,
  table: { current: ParsedTable | null }
) {
  const dataset = () => db().datasets.find((d) => d.id === job.datasetId)
  const report = (progress: number) => {
    update(job.id, { stage: def.stage, progress })
    emit(job.id, {
      type: "progress",
      data: { jobId: job.id, stage: def.stage, progress, message: def.message },
    })
  }

  report(def.from)
  await sleep(scaled(def.ms / 2))

  const current = dataset()
  if (!current) throw new Error("Dataset was deleted")

  switch (def.stage) {
    case "parsing": {
      if (job.failAt === "parsing") {
        throw new ParseError("Row 1,204 has 14 columns, expected 12.")
      }
      table.current = await loadTable(current)
      updateDataset(current.id, {
        rowCount: table.current.rows.length,
        columnCount: table.current.columns.length,
      })
      break
    }
    case "profiling": {
      const parsed = table.current ?? (await loadTable(current))
      const profiled = profileTable(
        parsed.columns.map((c) => c.name),
        parsed.rows
      )
      const columns: DatasetColumn[] = profiled.map((col, position) => ({
        id: newId(),
        name: col.name,
        originalName: parsed.columns[position]!.originalName,
        position,
        inferredType: col.type,
        overrideType: null,
        profile: col.profile,
      }))
      mutate((s) => {
        s.columns[current.id] = columns
      })
      updateDataset(current.id, { dateColumn: detectDateColumn(profiled) })
      await saveRows(current, parsed.rows)
      break
    }
    case "building_dashboard":
      await pipelineHooks.buildDashboard?.(current)
      break
    case "generating_insight":
      await pipelineHooks.generateInsight?.(current)
      break
  }

  report(def.to)
  await sleep(scaled(def.ms / 2))
}

export async function runIngest(jobId: string) {
  if (running.has(jobId)) return
  running.add(jobId)
  const table: { current: ParsedTable | null } = { current: null }
  try {
    const job = db().jobs.find((j) => j.id === jobId)
    if (!job) return
    updateDataset(job.datasetId, { status: "processing" })
    // Resume from the current stage (e.g. after a reload); earlier stages'
    // results are persisted, except parsed rows which profiling re-reads.
    const start = Math.max(
      0,
      STAGES.findIndex((s) => s.stage === job.stage)
    )
    for (const def of STAGES.slice(start)) {
      await runStage(job, def, table)
    }
    update(jobId, { stage: "ready", progress: 100 })
    updateDataset(job.datasetId, {
      status: "ready",
      readyAt: nowIso(),
      errorMessage: null,
    })
    emit(jobId, {
      type: "done",
      data: { jobId, datasetId: job.datasetId, status: "ready" },
    })
  } catch (error) {
    const job = db().jobs.find((j) => j.id === jobId)
    if (!job) return
    const message =
      error instanceof ParseError
        ? error.message
        : "Processing failed unexpectedly. Try uploading the file again."
    update(jobId, { stage: "failed", errorMessage: message })
    updateDataset(job.datasetId, { status: "failed", errorMessage: message })
    emit(jobId, {
      type: "done",
      data: {
        jobId,
        datasetId: job.datasetId,
        status: "failed",
        errorMessage: message,
      },
    })
  } finally {
    running.delete(jobId)
  }
}

export function startIngest(datasetId: string, failAt: JobStage | null = null) {
  const job: StoredJob = {
    id: newId(),
    datasetId,
    kind: "ingest",
    stage: "queued",
    progress: 0,
    startedAt: Date.now(),
    failAt,
    errorMessage: null,
  }
  mutate((s) => {
    s.jobs.push(job)
    const dataset = s.datasets.find((d) => d.id === datasetId)
    if (dataset) dataset.jobId = job.id
  })
  // Like a real worker, pick the job up asynchronously so the 202 response
  // still reports the dataset as queued.
  setTimeout(() => void runIngest(job.id), 0)
  return job
}

/** Regenerates a dataset's AI Brief (POST /insights) as a one-stage job. */
export async function runInsightJob(jobId: string) {
  if (running.has(jobId)) return
  running.add(jobId)
  const def: StageDef = {
    stage: "generating_insight",
    from: 20,
    to: 90,
    ms: 1600,
    message: "Writing the brief",
  }
  try {
    const job = db().jobs.find((j) => j.id === jobId)
    if (!job) return
    await runStage(job, def, { current: null })
    update(jobId, { stage: "ready", progress: 100 })
    emit(jobId, {
      type: "done",
      data: { jobId, datasetId: job.datasetId, status: "ready" },
    })
  } catch {
    const job = db().jobs.find((j) => j.id === jobId)
    if (!job) return
    const message = "The brief couldn't be regenerated. Try again."
    update(jobId, { stage: "failed", errorMessage: message })
    emit(jobId, {
      type: "done",
      data: {
        jobId,
        datasetId: job.datasetId,
        status: "failed",
        errorMessage: message,
      },
    })
  } finally {
    running.delete(jobId)
  }
}

export function startInsightJob(datasetId: string) {
  const job: StoredJob = {
    id: newId(),
    datasetId,
    kind: "insight",
    stage: "generating_insight",
    progress: 0,
    startedAt: Date.now(),
    failAt: null,
    errorMessage: null,
  }
  mutate((s) => {
    s.jobs.push(job)
  })
  setTimeout(() => void runInsightJob(job.id), 0)
  return job
}

/** Restarts jobs that were mid-flight when the page was reloaded. */
export function resumeJobs() {
  for (const job of db().jobs) {
    if (
      job.stage !== "ready" &&
      job.stage !== "failed" &&
      !running.has(job.id)
    ) {
      void (job.kind === "insight" ? runInsightJob(job.id) : runIngest(job.id))
    }
  }
}
