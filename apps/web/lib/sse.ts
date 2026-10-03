// Server-Sent Events over fetch (ADR-008). EventSource can't send an
// Authorization header, so we read the stream ourselves; reconnects resume
// with Last-Event-ID.

import { apiUrl, authHeaders } from "@/lib/api-client"
import { notifySessionExpired, refreshAccessToken } from "@/lib/auth-token"

export type SseMessage = { event: string; data: string; id?: string }

type StreamOptions = {
  onMessage: (message: SseMessage) => void
  signal: AbortSignal
  /** Return true when the stream is complete and should not reconnect. */
  isDone?: () => boolean
  maxRetries?: number
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      resolve()
    })
  })

/** Parses complete SSE blocks from a buffer; returns the unconsumed rest. */
export function parseSseChunk(
  buffer: string,
  onMessage: (m: SseMessage) => void
) {
  const blocks = buffer.split(/\r?\n\r?\n/)
  const rest = blocks.pop() ?? ""
  for (const block of blocks) {
    let event = "message"
    let id: string | undefined
    const data: string[] = []
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(":")) continue
      const sep = line.indexOf(":")
      const field = sep === -1 ? line : line.slice(0, sep)
      const value = sep === -1 ? "" : line.slice(sep + 1).replace(/^ /, "")
      if (field === "event") event = value
      else if (field === "data") data.push(value)
      else if (field === "id") id = value
    }
    if (data.length) onMessage({ event, data: data.join("\n"), id })
  }
  return rest
}

export async function streamEvents(path: string, options: StreamOptions) {
  const { onMessage, signal, isDone = () => false, maxRetries = 5 } = options
  let lastEventId: string | undefined
  let attempt = 0
  let refreshed = false

  while (!signal.aborted && !isDone()) {
    try {
      const response = await fetch(apiUrl(path), {
        headers: {
          Accept: "text/event-stream",
          ...authHeaders(),
          ...(lastEventId ? { "Last-Event-ID": lastEventId } : {}),
        },
        credentials: "include",
        signal,
      })

      if (response.status === 401 && !refreshed) {
        refreshed = true
        if (await refreshAccessToken()) continue
        notifySessionExpired()
        return
      }
      if (!response.ok || !response.body) {
        throw new Error(`Stream failed with ${response.status}`)
      }

      attempt = 0
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer = parseSseChunk(
          buffer + decoder.decode(value, { stream: true }),
          (message) => {
            if (message.id) lastEventId = message.id
            onMessage(message)
          }
        )
      }
    } catch {
      if (signal.aborted) return
    }

    if (isDone() || signal.aborted) return
    attempt += 1
    if (attempt > maxRetries) return
    await sleep(Math.min(1000 * 2 ** (attempt - 1), 10_000), signal)
  }
}
