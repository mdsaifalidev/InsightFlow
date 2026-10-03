import type { Metadata } from "next"

import { TableView } from "@/features/table/components/table-view"

export const metadata: Metadata = { title: "Table" }

export default function DatasetTablePage() {
  return <TableView />
}
