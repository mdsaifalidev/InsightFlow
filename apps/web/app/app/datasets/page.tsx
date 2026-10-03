import type { Metadata } from "next"

import { DatasetsView } from "@/features/datasets/components/datasets-view"

export const metadata: Metadata = { title: "Datasets" }

export default function DatasetsPage() {
  return <DatasetsView />
}
