import { http, HttpResponse } from "msw"

import type {
  ColumnType,
  Dataset,
  DatasetDetail,
  DatasetList,
  SampleKey,
  UploadResponse,
} from "@/lib/api/types"

import { rebuildAnalytics } from "../db/analytics"
import { coerce, profileColumn } from "../db/engine/profile"
import { resumeJobs, startIngest } from "../db/jobs"
import { deleteRows, getRows, saveUploadBlob } from "../db/rows"
import { samples } from "../db/samples"
import { db, mutate, newId, nowIso, type StoredDataset } from "../db/store"
import { latency, problem, requireAuth } from "../http"

/** The browser-side mock parses files on the main thread, so it stays small. */
export const MOCK_MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const PAGE_SIZE = 50
const COLUMN_TYPES: ColumnType[] = [
  "numeric",
  "categorical",
  "datetime",
  "boolean",
  "text",
  "id",
]

/** Public shape: drops mock-internal fields (workspace, source, date column). */
export function toDataset(stored: StoredDataset): Dataset {
  return {
    id: stored.id,
    name: stored.name,
    originalFilename: stored.originalFilename,
    fileType: stored.fileType,
    sizeBytes: stored.sizeBytes,
    rowCount: stored.rowCount,
    columnCount: stored.columnCount,
    status: stored.status,
    errorMessage: stored.errorMessage,
    jobId: stored.jobId,
    createdAt: stored.createdAt,
    readyAt: stored.readyAt,
  }
}

/** Finds a dataset in the caller's workspace or throws a 404. */
export function findDataset(workspaceId: string, id: string): StoredDataset {
  const dataset = db().datasets.find(
    (d) => d.id === id && d.workspaceId === workspaceId
  )
  if (!dataset)
    throw problem(
      404,
      "Dataset not found",
      "This dataset doesn't exist or was deleted."
    )
  return dataset
}

function datasetDetail(dataset: StoredDataset): DatasetDetail {
  return { ...toDataset(dataset), columns: db().columns[dataset.id] ?? [] }
}

function createDataset(
  workspaceId: string,
  fields: Pick<
    StoredDataset,
    "name" | "originalFilename" | "fileType" | "sizeBytes" | "source"
  >
): StoredDataset {
  const dataset: StoredDataset = {
    id: newId(),
    workspaceId,
    ...fields,
    rowCount: null,
    columnCount: null,
    status: "queued",
    errorMessage: null,
    jobId: null,
    createdAt: nowIso(),
    readyAt: null,
    dateColumn: null,
  }
  mutate((s) => {
    s.datasets.push({ ...dataset })
  })
  const failAt = db().settings.failNextUpload ? "parsing" : null
  if (failAt) {
    mutate((s) => {
      s.settings.failNextUpload = false
    })
  }
  const job = startIngest(dataset.id, failAt)
  return { ...dataset, jobId: job.id }
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "")
}

/** Stores an already-validated upload and starts its ingest job. */
export async function createUploadDataset(
  workspaceId: string,
  file: File,
  name?: string
): Promise<UploadResponse> {
  const blobKey = newId()
  await saveUploadBlob(blobKey, file)
  const dataset = createDataset(workspaceId, {
    name: name?.trim() || stripExtension(file.name),
    originalFilename: file.name,
    fileType: file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv",
    sizeBytes: file.size,
    source: { kind: "upload", blobKey },
  })
  return { dataset: toDataset(dataset), jobId: dataset.jobId! }
}

export const datasetHandlers = [
  http.get("*/api/data/datasets", async ({ request }) => {
    await latency(0.6)
    const { workspace } = requireAuth(request)
    resumeJobs()
    const url = new URL(request.url)
    const q = url.searchParams.get("q")?.trim().toLowerCase() ?? ""
    const sort = url.searchParams.get("sort") ?? "newest"
    const offset = Number(url.searchParams.get("cursor") ?? 0)

    const items = db()
      .datasets.filter((d) => d.workspaceId === workspace.id)
      .filter(
        (d) =>
          !q ||
          d.name.toLowerCase().includes(q) ||
          d.originalFilename.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name)
        if (sort === "rows") return (b.rowCount ?? -1) - (a.rowCount ?? -1)
        return b.createdAt.localeCompare(a.createdAt)
      })
    const page = items.slice(offset, offset + PAGE_SIZE)
    const body: DatasetList = {
      items: page.map(toDataset),
      nextCursor:
        offset + PAGE_SIZE < items.length ? String(offset + PAGE_SIZE) : null,
    }
    return HttpResponse.json(body)
  }),

  http.post("*/api/data/datasets", async ({ request }) => {
    await latency()
    const { workspace } = requireAuth(request)
    const form = await request.formData()
    const file = form.get("file")
    if (!(file instanceof File)) {
      return problem(422, "Validation failed", "Choose a file to upload.", {
        file: "Choose a file to upload.",
      })
    }
    const extension = file.name.split(".").pop()?.toLowerCase()
    if (extension !== "csv" && extension !== "xlsx") {
      return problem(
        415,
        "Unsupported file type",
        "Upload a .csv or .xlsx file."
      )
    }
    if (file.size === 0) {
      return problem(422, "Validation failed", "The file is empty.", {
        file: "The file is empty.",
      })
    }
    if (file.size > MOCK_MAX_UPLOAD_BYTES) {
      return problem(
        413,
        "File too large",
        "The demo backend accepts files up to 20 MB; the real service accepts 100 MB."
      )
    }

    const body = await createUploadDataset(
      workspace.id,
      file,
      String(form.get("name") ?? "")
    )
    return HttpResponse.json(body, { status: 202 })
  }),

  http.post("*/api/data/datasets/sample", async ({ request }) => {
    await latency()
    const { workspace } = requireAuth(request)
    const { key } = (await request.json()) as { key?: SampleKey }
    const sample = key ? samples[key] : undefined
    if (!sample) {
      return problem(422, "Validation failed", "Unknown sample dataset.", {
        key: "Unknown sample.",
      })
    }
    const dataset = createDataset(workspace.id, {
      name: sample.name,
      originalFilename: sample.filename,
      fileType: "csv",
      sizeBytes: sample.sizeBytes,
      source: { kind: "sample", key: sample.key },
    })
    const body: UploadResponse = {
      dataset: toDataset(dataset),
      jobId: dataset.jobId!,
    }
    return HttpResponse.json(body, { status: 202 })
  }),

  http.get("*/api/data/datasets/:id", async ({ request, params }) => {
    await latency(0.6)
    const { workspace } = requireAuth(request)
    resumeJobs()
    return HttpResponse.json(
      datasetDetail(findDataset(workspace.id, String(params.id)))
    )
  }),

  http.delete("*/api/data/datasets/:id", async ({ request, params }) => {
    await latency()
    const { workspace } = requireAuth(request)
    const dataset = findDataset(workspace.id, String(params.id))
    await deleteRows(dataset)
    mutate((s) => {
      s.datasets = s.datasets.filter((d) => d.id !== dataset.id)
      s.widgets = s.widgets.filter((w) => w.datasetId !== dataset.id)
      s.insights = s.insights.filter((i) => i.datasetId !== dataset.id)
      s.jobs = s.jobs.filter((j) => j.datasetId !== dataset.id)
      delete s.columns[dataset.id]
    })
    return new HttpResponse(null, { status: 204 })
  }),

  http.patch(
    "*/api/data/datasets/:id/columns/:columnId",
    async ({ request, params }) => {
      await latency()
      const { workspace } = requireAuth(request)
      const dataset = findDataset(workspace.id, String(params.id))
      const { type } = (await request.json()) as { type?: ColumnType | null }
      if (type !== null && (!type || !COLUMN_TYPES.includes(type))) {
        return problem(
          422,
          "Validation failed",
          "Choose a valid column type.",
          { type: "Invalid type." }
        )
      }
      if (dataset.status !== "ready") {
        return problem(
          409,
          "Dataset not ready",
          "Wait for processing to finish before changing column types."
        )
      }
      const column = (db().columns[dataset.id] ?? []).find(
        (c) => c.id === params.columnId
      )
      if (!column) return problem(404, "Column not found")

      const effective = type ?? column.inferredType
      const rows = await getRows(dataset)
      const values = rows.map((row) =>
        coerce(row[column.name] ?? null, effective)
      )
      const profile = profileColumn(values, effective)

      const updated = mutate((s) => {
        const target = s.columns[dataset.id]!.find((c) => c.id === column.id)!
        target.overrideType = type && type !== column.inferredType ? type : null
        target.profile = profile
        return { ...target }
      })
      // Charts and the brief depend on column types.
      await rebuildAnalytics(dataset)
      return HttpResponse.json(updated)
    }
  ),
]
