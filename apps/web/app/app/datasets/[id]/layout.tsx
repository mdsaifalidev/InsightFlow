import { DatasetFrame } from "@/features/datasets/components/dataset-frame"

export default function DatasetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DatasetFrame>{children}</DatasetFrame>
}
