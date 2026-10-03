import type { FieldValues, Path, UseFormSetError } from "react-hook-form"

import { ApiError } from "@/lib/api-client"

/**
 * Maps an RFC 7807 problem onto the form: field errors go to their inputs,
 * anything else becomes a form-level message (returned for display).
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[]
): string | null {
  if (!(error instanceof ApiError)) {
    return "Can't reach the server. Check your connection and try again."
  }
  const fieldErrors = error.problem.errors ?? {}
  let unmatched = false
  for (const [field, message] of Object.entries(fieldErrors)) {
    if ((fields as readonly string[]).includes(field)) {
      setError(field as Path<T>, { message })
    } else {
      unmatched = true
    }
  }
  if (Object.keys(fieldErrors).length && !unmatched) return null
  return error.problem.detail ?? error.problem.title
}
