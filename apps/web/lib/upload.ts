// Multipart upload with progress. fetch() has no upload progress events, so
// this uses XMLHttpRequest and mirrors apiFetch's auth + error handling.

import {
  ApiError,
  apiUrl,
  authHeaders,
  type ProblemDetails,
} from "@/lib/api-client"
import { notifySessionExpired, refreshAccessToken } from "@/lib/auth-token"

type UploadOptions = {
  /** 0–1, or null when the browser can't measure progress. */
  onProgress?: (fraction: number | null) => void
  signal?: AbortSignal
}

function send<T>(
  path: string,
  body: FormData,
  { onProgress, signal }: UploadOptions
) {
  return new Promise<{ status: number; data: T | ProblemDetails }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open("POST", apiUrl(path))
      xhr.withCredentials = true
      xhr.setRequestHeader("Accept", "application/json")
      for (const [key, value] of Object.entries(authHeaders())) {
        xhr.setRequestHeader(key, value)
      }
      xhr.upload.onprogress = (event) => {
        onProgress?.(event.lengthComputable ? event.loaded / event.total : null)
      }
      xhr.onload = () => {
        let data: unknown = null
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null
        } catch {
          data = {
            title: xhr.statusText || "Upload failed",
            status: xhr.status,
          }
        }
        resolve({ status: xhr.status, data: data as T | ProblemDetails })
      }
      xhr.onerror = () => reject(new Error("Network error during upload"))
      xhr.onabort = () =>
        reject(new DOMException("Upload cancelled", "AbortError"))
      signal?.addEventListener("abort", () => xhr.abort())
      onProgress?.(null)
      xhr.send(body)
    }
  )
}

export async function uploadFile<T>(
  path: string,
  body: FormData,
  options: UploadOptions = {}
): Promise<T> {
  let result = await send<T>(path, body, options)
  if (result.status === 401) {
    if (await refreshAccessToken()) {
      result = await send<T>(path, body, options)
    } else {
      notifySessionExpired()
    }
  }
  if (result.status < 200 || result.status >= 300) {
    const problem = result.data as ProblemDetails | null
    throw new ApiError({
      title: problem?.title ?? "Upload failed",
      status: result.status,
      ...problem,
    })
  }
  options.onProgress?.(1)
  return result.data as T
}
