import {
  CalendarIcon,
  FingerprintIcon,
  HashIcon,
  TagsIcon,
  ToggleLeftIcon,
  TypeIcon,
  type LucideIcon,
} from "lucide-react"

import type { ColumnType, JobStage } from "@/lib/api/types"

/** PRD F2: the real service accepts up to 100 MB. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
export const ACCEPTED_EXTENSIONS = [".csv", ".xlsx"]

export const INGEST_STAGES: { stage: JobStage; label: string }[] = [
  { stage: "queued", label: "Queued" },
  { stage: "parsing", label: "Reading the file" },
  { stage: "profiling", label: "Profiling columns" },
  { stage: "building_dashboard", label: "Building the dashboard" },
  { stage: "generating_insight", label: "Writing the brief" },
]

/** User-facing names for column types (not the internal enum). */
export const COLUMN_TYPES: Record<
  ColumnType,
  { label: string; icon: LucideIcon }
> = {
  numeric: { label: "Number", icon: HashIcon },
  categorical: { label: "Category", icon: TagsIcon },
  datetime: { label: "Date & time", icon: CalendarIcon },
  boolean: { label: "Yes / no", icon: ToggleLeftIcon },
  text: { label: "Text", icon: TypeIcon },
  id: { label: "Identifier", icon: FingerprintIcon },
}
