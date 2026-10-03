import type { Metadata } from "next"

import { ColumnsView } from "@/features/columns/components/columns-view"

export const metadata: Metadata = { title: "Columns" }

export default function DatasetColumnsPage() {
  return <ColumnsView />
}
