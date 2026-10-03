import { http, HttpResponse } from "msw"

import type { RegenerateInsightResponse } from "@/lib/api/types"

import { ensureInsight } from "../db/analytics"
import { startInsightJob } from "../db/jobs"
import { db, mutate } from "../db/store"
import { latency, problem, requireAuth } from "../http"
import { findDataset } from "./datasets"

/** PRD F8: at most 5 regenerations per dataset per hour. */
export const REGENERATE_LIMIT = 5
const WINDOW_MS = 60 * 60 * 1000

export const insightHandlers = [
  http.get(
    "*/api/data/datasets/:id/insights/latest",
    async ({ request, params }) => {
      await latency(0.7)
      const { workspace } = requireAuth(request)
      const dataset = findDataset(workspace.id, String(params.id))
      if (dataset.status !== "ready") {
        return problem(
          409,
          "Dataset not ready",
          "The brief is written once processing finishes."
        )
      }
      return HttpResponse.json(await ensureInsight(dataset))
    }
  ),

  http.post("*/api/data/datasets/:id/insights", async ({ request, params }) => {
    await latency(0.5)
    const { workspace } = requireAuth(request)
    const dataset = findDataset(workspace.id, String(params.id))
    const now = Date.now()
    const recent = (db().insightRegenerations[dataset.id] ?? []).filter(
      (t) => now - t < WINDOW_MS
    )
    if (recent.length >= REGENERATE_LIMIT) {
      const retryAfter = Math.ceil((recent[0]! + WINDOW_MS - now) / 1000)
      const response = problem(
        429,
        "Too many regenerations",
        `You can regenerate the brief ${REGENERATE_LIMIT} times an hour.`
      )
      response.headers.set("Retry-After", String(retryAfter))
      return response
    }
    mutate((s) => {
      s.insightRegenerations[dataset.id] = [...recent, now]
    })
    const job = startInsightJob(dataset.id)
    const body: RegenerateInsightResponse = { jobId: job.id }
    return HttpResponse.json(body, { status: 202 })
  }),
]
