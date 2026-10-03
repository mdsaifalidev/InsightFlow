// Node environment: native fetch/FormData (jsdom + MSW can't parse multipart
// XHR bodies). The XHR progress path in lib/upload.ts is covered by Playwright.
// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest"

import { apiFetch, ApiError } from "@/lib/api-client"
import type {
  AuthResponse,
  DatasetColumn,
  DatasetDetail,
  DatasetList,
  UploadResponse,
} from "@/lib/api/types"
import { setAccessToken } from "@/lib/auth-token"
import { streamEvents, type SseMessage } from "@/lib/sse"

import { mutate } from "../db/store"

async function signUp(email = "maya@example.com") {
  const res = await apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { name: "Maya", email, password: "long-enough" },
  })
  setAccessToken(res.accessToken)
  return res
}

function csvFile(content: string, name = "sales.csv") {
  return new File([content], name, { type: "text/csv" })
}

async function upload(file: File) {
  const form = new FormData()
  form.append("file", file)
  return apiFetch<UploadResponse>("/api/data/datasets", {
    method: "POST",
    body: form,
  })
}

/** Follows the SSE stream until the job finishes. */
async function waitForJob(jobId: string) {
  const messages: SseMessage[] = []
  let done = false
  const controller = new AbortController()
  await streamEvents(`/api/data/jobs/${jobId}/events`, {
    signal: controller.signal,
    isDone: () => done,
    onMessage: (message) => {
      messages.push(message)
      if (message.event === "done") {
        done = true
        controller.abort()
      }
    },
  })
  return messages
}

const csv =
  "Order Date,Region,Revenue\n2025-01-01,EU,100\n2025-01-02,US,250.5\n2025-01-03,EU,80\n"

describe("mock dataset service", () => {
  beforeEach(async () => {
    setAccessToken(null)
    await signUp()
  })

  it("ingests an uploaded CSV through every stage to ready", async () => {
    const { dataset, jobId } = await upload(csvFile(csv))
    expect(dataset.status).toBe("queued")

    const messages = await waitForJob(jobId)
    const stages = messages
      .filter((m) => m.event === "progress")
      .map((m) => (JSON.parse(m.data) as { stage: string }).stage)
    expect(new Set(stages)).toEqual(
      new Set([
        "queued",
        "parsing",
        "profiling",
        "building_dashboard",
        "generating_insight",
      ])
    )
    expect(JSON.parse(messages.at(-1)!.data)).toMatchObject({ status: "ready" })

    const detail = await apiFetch<DatasetDetail>(
      `/api/data/datasets/${dataset.id}`
    )
    expect(detail).toMatchObject({
      status: "ready",
      rowCount: 3,
      columnCount: 3,
      name: "sales",
    })
    expect(
      detail.columns.map((c) => [c.name, c.originalName, c.inferredType])
    ).toEqual([
      ["order_date", "Order Date", "datetime"],
      ["region", "Region", "categorical"],
      ["revenue", "Revenue", "numeric"],
    ])
  })

  it("fails a job with a readable message when asked to", async () => {
    mutate((s) => {
      s.settings.failNextUpload = true
    })
    const { dataset, jobId } = await upload(csvFile(csv))
    const messages = await waitForJob(jobId)
    expect(JSON.parse(messages.at(-1)!.data)).toMatchObject({
      status: "failed",
      errorMessage: "Row 1,204 has 14 columns, expected 12.",
    })
    const detail = await apiFetch<DatasetDetail>(
      `/api/data/datasets/${dataset.id}`
    )
    expect(detail.status).toBe("failed")
  })

  it("fails a job for a malformed CSV", async () => {
    const { jobId } = await upload(csvFile("a,b\n1,2\n3\n"))
    const messages = await waitForJob(jobId)
    expect(JSON.parse(messages.at(-1)!.data).errorMessage).toBe(
      "Row 3 has 1 columns, expected 2."
    )
  })

  it.each([
    [csvFile("x", "report.pdf"), 415],
    [csvFile("", "empty.csv"), 422],
    [new File([new Uint8Array(21 * 1024 * 1024)], "huge.csv"), 413],
  ])("rejects invalid uploads (%#)", async (file, status) => {
    const error = await upload(file).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(status)
  })

  it("creates sample datasets and scopes them to the workspace", async () => {
    const { dataset, jobId } = await apiFetch<UploadResponse>(
      "/api/data/datasets/sample",
      {
        method: "POST",
        body: { key: "orders" },
      }
    )
    await waitForJob(jobId)
    const list = await apiFetch<DatasetList>("/api/data/datasets?q=orders")
    expect(list.items.map((d) => d.id)).toEqual([dataset.id])

    await signUp("arif@example.com")
    expect((await apiFetch<DatasetList>("/api/data/datasets")).items).toEqual(
      []
    )
    const error = await apiFetch(`/api/data/datasets/${dataset.id}`).catch(
      (e: unknown) => e
    )
    expect((error as ApiError).status).toBe(404)
  })

  it("re-profiles a column when its type is overridden, and deletes cleanly", async () => {
    const { dataset, jobId } = await upload(csvFile(csv))
    await waitForJob(jobId)
    const detail = await apiFetch<DatasetDetail>(
      `/api/data/datasets/${dataset.id}`
    )
    const revenue = detail.columns.find((c) => c.name === "revenue")!

    const updated = await apiFetch<DatasetColumn>(
      `/api/data/datasets/${dataset.id}/columns/${revenue.id}`,
      { method: "PATCH", body: { type: "categorical" } }
    )
    expect(updated.overrideType).toBe("categorical")
    expect(updated.profile.categorical?.top).toHaveLength(3)

    await apiFetch(`/api/data/datasets/${dataset.id}`, { method: "DELETE" })
    expect((await apiFetch<DatasetList>("/api/data/datasets")).items).toEqual(
      []
    )
  })
})
