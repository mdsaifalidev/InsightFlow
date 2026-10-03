// Rows with column-type overrides applied (Columns page), so every query sees
// the types the user chose.

import { getRows } from "../rows"
import { db, type StoredDataset } from "../store"
import type { Row } from "../types"
import { coerce } from "./profile"

const cache = new Map<string, { signature: string; rows: Row[] }>()

export async function getTypedRows(dataset: StoredDataset): Promise<Row[]> {
  const rows = await getRows(dataset)
  const overrides = (db().columns[dataset.id] ?? []).filter(
    (c) => c.overrideType
  )
  if (!overrides.length) return rows

  const signature = overrides
    .map((c) => `${c.name}:${c.overrideType}`)
    .join("|")
  const hit = cache.get(dataset.id)
  if (hit?.signature === signature) return hit.rows

  const typed = rows.map((row) => {
    const copy = { ...row }
    for (const column of overrides) {
      copy[column.name] = coerce(row[column.name] ?? null, column.overrideType!)
    }
    return copy
  })
  cache.set(dataset.id, { signature, rows: typed })
  return typed
}

export function clearTypedRowCache() {
  cache.clear()
}
