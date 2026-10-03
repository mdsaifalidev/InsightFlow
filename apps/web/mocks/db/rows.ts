// Row storage for mock datasets. Samples regenerate from their seed; uploads
// are kept in IndexedDB (raw file until parsed, then typed rows). Falls back
// to memory where IndexedDB doesn't exist (Vitest/jsdom).

import { del, get, set } from "idb-keyval"

import { samples } from "./samples"
import type { StoredDataset } from "./store"
import type { Row } from "./types"

const memory = new Map<string, unknown>()
const rowCache = new Map<string, Row[]>()

const hasIndexedDb = () => typeof indexedDB !== "undefined"

async function kvGet<T>(key: string): Promise<T | undefined> {
  return hasIndexedDb() ? get<T>(key) : (memory.get(key) as T | undefined)
}

async function kvSet(key: string, value: unknown) {
  if (hasIndexedDb()) await set(key, value)
  else memory.set(key, value)
}

async function kvDel(key: string) {
  if (hasIndexedDb()) await del(key)
  else memory.delete(key)
}

export const saveUploadBlob = (blobKey: string, file: Blob) =>
  kvSet(`blob:${blobKey}`, file)
export const loadUploadBlob = (blobKey: string) =>
  kvGet<Blob>(`blob:${blobKey}`)

export async function saveRows(dataset: StoredDataset, rows: Row[]) {
  rowCache.set(dataset.id, rows)
  if (dataset.source.kind === "upload") {
    await kvSet(`rows:${dataset.source.blobKey}`, rows)
    await kvDel(`blob:${dataset.source.blobKey}`)
  }
}

/** Typed rows for a dataset that finished parsing. */
export async function getRows(dataset: StoredDataset): Promise<Row[]> {
  const cached = rowCache.get(dataset.id)
  if (cached) return cached
  let rows: Row[]
  if (dataset.source.kind === "sample") {
    // Samples are re-profiled on load so values are coerced exactly as at ingest.
    const { profileTable } = await import("./engine/profile")
    const table = samples[dataset.source.key].generate()
    profileTable(
      table.columns.map((c) => c.name),
      table.rows
    )
    rows = table.rows
  } else {
    rows = (await kvGet<Row[]>(`rows:${dataset.source.blobKey}`)) ?? []
  }
  rowCache.set(dataset.id, rows)
  return rows
}

export async function deleteRows(dataset: StoredDataset) {
  rowCache.delete(dataset.id)
  if (dataset.source.kind === "upload") {
    await kvDel(`rows:${dataset.source.blobKey}`)
    await kvDel(`blob:${dataset.source.blobKey}`)
  }
}

export function clearRowCache() {
  rowCache.clear()
  memory.clear()
}
