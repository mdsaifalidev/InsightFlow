import { http, HttpResponse } from "msw"

import { currentEvent, resumeJobs, subscribe, type JobEvent } from "../db/jobs"
import { db } from "../db/store"
import { problem, requireAuth } from "../http"

const HEARTBEAT_MS = 15_000

function format(event: JobEvent) {
  return `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`
}

export const jobHandlers = [
  // Server-Sent Events progress stream (ADR-008).
  http.get("*/api/data/jobs/:jobId/events", ({ request, params }) => {
    const { workspace } = requireAuth(request)
    const job = db().jobs.find((j) => j.id === params.jobId)
    const dataset = job && db().datasets.find((d) => d.id === job.datasetId)
    if (!job || dataset?.workspaceId !== workspace.id) {
      return problem(404, "Job not found")
    }
    resumeJobs()

    const encoder = new TextEncoder()
    let cleanup = () => {}
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (chunk: string) => {
          try {
            controller.enqueue(encoder.encode(chunk))
          } catch {
            cleanup()
          }
        }
        const close = () => {
          cleanup()
          try {
            controller.close()
          } catch {
            // Already closed by the client.
          }
        }

        // Replay current state first, so reconnects (Last-Event-ID) catch up.
        const initial = currentEvent(db().jobs.find((j) => j.id === job.id)!)
        send(format(initial))
        if (initial.type === "done") {
          close()
          return
        }

        const unsubscribe = subscribe(job.id, (event) => {
          send(format(event))
          if (event.type === "done") close()
        })
        const heartbeat = setInterval(
          () => send(": heartbeat\n\n"),
          HEARTBEAT_MS
        )
        cleanup = () => {
          unsubscribe()
          clearInterval(heartbeat)
        }
        request.signal.addEventListener("abort", close)
      },
      cancel() {
        cleanup()
      },
    })

    return new HttpResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  }),
]
