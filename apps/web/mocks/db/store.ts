// In-browser mock database for MSW. Metadata persists in localStorage so the
// demo survives reloads; sample rows are regenerated from seeds and uploaded
// rows live in IndexedDB (see rows.ts).

import type {
  Dataset,
  DatasetColumn,
  Insight,
  JobStage,
  SampleKey,
  Widget,
  Workspace,
} from "@/lib/api/types"

export type MockUser = {
  id: string
  email: string
  name: string
  passwordHash: string
  workspaceId: string
  createdAt: string
}

export type MockSession = {
  id: string
  userId: string
  expiresAt: number
}

export type DatasetSource =
  { kind: "sample"; key: SampleKey } | { kind: "upload"; blobKey: string }

export type StoredDataset = Dataset & {
  workspaceId: string
  source: DatasetSource
  dateColumn: string | null
  /** Auto widgets were generated (they stay deleted if the user removes them). */
  dashboardBuilt?: boolean
}

export type StoredJob = {
  id: string
  datasetId: string
  kind: "ingest" | "insight"
  stage: JobStage
  progress: number
  startedAt: number
  /** Planned failure (mock controls), applied when the job reaches this stage. */
  failAt: JobStage | null
  errorMessage: string | null
}

export type MockSettings = {
  /** Base latency added to every mocked response. */
  latencyMs: number
  /** Next upload fails during parsing, to exercise error states. */
  failNextUpload: boolean
}

export type MockState = {
  version: 1
  users: MockUser[]
  workspaces: Workspace[]
  sessions: MockSession[]
  /** Simulates the httpOnly refresh-token cookie (MSW can't set real ones). */
  currentSessionId: string | null
  datasets: StoredDataset[]
  columns: Record<string, DatasetColumn[]>
  widgets: Widget[]
  insights: Insight[]
  jobs: StoredJob[]
  /** Regenerate timestamps per dataset, for the insight rate limit. */
  insightRegenerations: Record<string, number[]>
  settings: MockSettings
}

export const STORAGE_KEY = "insightflow.mock.v1"

const defaultSettings: MockSettings = { latencyMs: 250, failNextUpload: false }

function emptyState(): MockState {
  return {
    version: 1,
    users: [],
    workspaces: [],
    sessions: [],
    currentSessionId: null,
    datasets: [],
    columns: {},
    widgets: [],
    insights: [],
    jobs: [],
    insightRegenerations: {},
    settings: { ...defaultSettings },
  }
}

let state: MockState | null = null

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage
  } catch {
    return null
  }
}

function load(): MockState {
  const raw = storage()?.getItem(STORAGE_KEY)
  if (!raw) return emptyState()
  try {
    const parsed = JSON.parse(raw) as MockState
    return parsed.version === 1 ? { ...emptyState(), ...parsed } : emptyState()
  } catch {
    return emptyState()
  }
}

/** Current state; read-only by convention — use `mutate` to change it. */
export function db(): MockState {
  state ??= load()
  return state
}

export function mutate<T>(fn: (draft: MockState) => T): T {
  const current = db()
  const result = fn(current)
  storage()?.setItem(STORAGE_KEY, JSON.stringify(current))
  return result
}

/** Wipes all mock data (mock controls, tests). */
export function resetDb() {
  state = emptyState()
  storage()?.removeItem(STORAGE_KEY)
}

export function newId() {
  return crypto.randomUUID()
}

export function nowIso() {
  return new Date().toISOString()
}
