"use client"

import * as React from "react"
import { useQueryStates } from "nuqs"

import type { DatasetDetail } from "@/lib/api/types"

import { filterParams, resolveDateRange, toApiFilters } from "./params"

/** Filter state for a dataset, from the URL, resolved to the API shape. */
export function useFilters(dataset: DatasetDetail) {
  const [params, setParams] = useQueryStates(filterParams)

  const dateColumn = React.useMemo(() => {
    const column = dataset.columns.find(
      (c) =>
        (c.overrideType ?? c.inferredType) === "datetime" && c.profile.datetime
    )
    return column
      ? {
          name: column.name,
          min: column.profile.datetime!.min,
          max: column.profile.datetime!.max,
        }
      : null
  }, [dataset.columns])

  const range = resolveDateRange(
    params.range,
    params.from,
    params.to,
    dateColumn?.max ?? null
  )
  const filters = React.useMemo(
    () => toApiFilters(dateColumn?.name ?? null, range, params.where),
    // range is derived from primitives below; listing them keeps this stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dateColumn?.name, range?.from, range?.to, params.where]
  )
  const active = !!range || params.where.length > 0

  return { params, setParams, filters, dateColumn, range, active }
}
