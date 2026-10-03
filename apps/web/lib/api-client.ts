// Thin fetch wrapper shared by all API hooks. Requests go to the same origin
// by default (nginx gateway in Docker, MSW in mock mode).

import {
  getAccessToken,
  notifySessionExpired,
  refreshAccessToken,
} from "@/lib/auth-token"

const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? ""

// Auth endpoints never trigger the refresh-and-retry path.
const NO_RETRY_PATHS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/refresh",
  "/api/auth/logout",
]

/** RFC 7807 problem details, as returned by both backend services. */
export type ProblemDetails = {
  type?: string
  title: string
  status: number
  detail?: string
  instance?: string
  /** Field-level validation messages, keyed by request field name. */
  errors?: Record<string, string>
  [key: string]: unknown
}

export class ApiError extends Error {
  readonly status: number
  readonly problem: ProblemDetails

  constructor(problem: ProblemDetails) {
    super(problem.detail ?? problem.title)
    this.name = "ApiError"
    this.status = problem.status
    this.problem = problem
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown
}

export function apiUrl(path: string) {
  return `${baseUrl}${path}`
}

export function authHeaders(): Record<string, string> {
  const token = getAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  let response = await send(path, options)

  if (response.status === 401 && !NO_RETRY_PATHS.includes(path)) {
    if (await refreshAccessToken()) {
      response = await send(path, options)
    } else {
      notifySessionExpired()
    }
  }

  if (!response.ok) {
    throw new ApiError(await toProblem(response))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

function send(path: string, { body, headers, ...init }: RequestOptions) {
  const isFormData = body instanceof FormData
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      Accept: "application/json",
      ...(body !== undefined && !isFormData
        ? { "Content-Type": "application/json" }
        : {}),
      ...authHeaders(),
      ...headers,
    },
    body:
      body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })
}

async function toProblem(response: Response): Promise<ProblemDetails> {
  const fallback: ProblemDetails = {
    title: response.statusText || "Request failed",
    status: response.status,
  }
  try {
    const data = (await response.json()) as Partial<ProblemDetails>
    return { ...fallback, ...data }
  } catch {
    return fallback
  }
}
