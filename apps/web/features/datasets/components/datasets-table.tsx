"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MoreHorizontalIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import type { Dataset } from "@/lib/api/types"
import { formatBytes, formatNumber, formatRelative } from "@/lib/format"

import { DatasetInlineProgress, DatasetStatusBadge } from "./dataset-status"
import { DeleteDatasetDialog } from "./delete-dataset-dialog"

export function DatasetsTable({ datasets }: { datasets: Dataset[] }) {
  return (
    <div className="overflow-hidden rounded-lg bg-card shadow-e1 ring-1 ring-border-soft">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-full">Name</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden text-right md:table-cell">
              Rows
            </TableHead>
            <TableHead className="hidden text-right md:table-cell">
              Columns
            </TableHead>
            <TableHead className="hidden text-right lg:table-cell">
              Size
            </TableHead>
            <TableHead className="hidden sm:table-cell">Added</TableHead>
            <TableHead>
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {datasets.map((dataset, i) => (
            <DatasetRow key={dataset.id} dataset={dataset} index={i} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function DatasetRow({ dataset, index }: { dataset: Dataset; index: number }) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const href = `/app/datasets/${dataset.id}`

  return (
    <TableRow
      // Rows arrive in sequence. CSS, not Motion: it needs no JavaScript and
      // motion-safe: means every Playwright config (all set reducedMotion)
      // and `pnpm --filter web shots` see the settled row immediately.
      className="motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <TableCell className="max-w-0">
        <Link
          href={href}
          className="flex min-w-0 flex-col rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="truncate font-medium hover:underline">
            {dataset.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {dataset.originalFilename}
          </span>
        </Link>
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1.5">
          <DatasetStatusBadge dataset={dataset} />
          <DatasetInlineProgress dataset={dataset} />
        </div>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {formatNumber(dataset.rowCount)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {formatNumber(dataset.columnCount)}
      </TableCell>
      <TableCell className="hidden text-right tabular-nums lg:table-cell">
        {formatBytes(dataset.sizeBytes)}
      </TableCell>
      <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
        {formatRelative(dataset.createdAt)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${dataset.name}`}
            >
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem onSelect={() => router.push(href)}>
                Open
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => router.push(`${href}/columns`)}>
                View columns
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                Delete
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DeleteDatasetDialog
          dataset={dataset}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
        />
      </TableCell>
    </TableRow>
  )
}
