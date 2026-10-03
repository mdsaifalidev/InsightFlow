"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { toast } from "sonner"

import type { ColumnType, DatasetColumn } from "@/lib/api/types"
import { formatDate, formatNumber, formatPercent } from "@/lib/format"
import { useOverrideColumnType } from "@/features/datasets/api"
import { COLUMN_TYPES } from "@/features/datasets/constants"
import { useCurrentDataset } from "@/features/datasets/components/dataset-frame"

import { ColumnProfileDetails } from "./column-profile-details"

export function ColumnsView() {
  const dataset = useCurrentDataset()
  const override = useOverrideColumnType(dataset.id)

  const changeType = (column: DatasetColumn, type: ColumnType) => {
    override.mutate(
      { columnId: column.id, type: type === column.inferredType ? null : type },
      {
        onSuccess: () =>
          toast.success(
            `${column.name} is now ${COLUMN_TYPES[type].label.toLowerCase()}`
          ),
        onError: (error) =>
          toast.error(`Couldn't change ${column.name}`, {
            description: error.message,
          }),
      }
    )
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="columns-heading">
      <div className="flex flex-col gap-1">
        <h2 id="columns-heading" className="text-section">
          {dataset.columns.length} columns
        </h2>
        <p className="text-sm text-muted-foreground">
          Types were detected automatically. Change one if it looks wrong; its
          profile is recalculated and marked as changed.
        </p>
      </div>
      <div className="overflow-hidden rounded-lg bg-card shadow-e1 ring-1 ring-border-soft">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Column</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Missing</TableHead>
              <TableHead className="hidden text-right md:table-cell">
                Distinct
              </TableHead>
              <TableHead className="min-w-56">Profile</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dataset.columns.map((column) => (
              <ColumnRow
                key={column.id}
                column={column}
                pending={
                  override.isPending &&
                  override.variables?.columnId === column.id
                }
                onTypeChange={(type) => changeType(column, type)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

function ColumnRow({
  column,
  pending,
  onTypeChange,
}: {
  column: DatasetColumn
  pending: boolean
  onTypeChange: (type: ColumnType) => void
}) {
  const type = column.overrideType ?? column.inferredType
  const TypeIcon = COLUMN_TYPES[type].icon

  return (
    <TableRow>
      <TableCell>
        <HoverCard openDelay={150}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <TypeIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <span className="flex flex-col">
                <span className="font-medium">{column.name}</span>
                {column.originalName !== column.name ? (
                  <span className="text-xs text-muted-foreground">
                    {column.originalName}
                  </span>
                ) : null}
              </span>
            </button>
          </HoverCardTrigger>
          <HoverCardContent align="start" className="w-80">
            <ColumnProfileDetails column={column} type={type} />
          </HoverCardContent>
        </HoverCard>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Select
            value={type}
            onValueChange={(value) => onTypeChange(value as ColumnType)}
            disabled={pending}
          >
            <SelectTrigger
              size="sm"
              className="w-36"
              aria-label={`Type of ${column.name}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {(Object.keys(COLUMN_TYPES) as ColumnType[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {COLUMN_TYPES[value].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          {column.overrideType ? (
            <Badge variant="outline">Changed</Badge>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <div className="flex items-center gap-2">
          <div
            className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="h-full bg-muted-foreground/70"
              style={{
                width: `${Math.max(column.profile.nullPct * 100, column.profile.nullPct ? 4 : 0)}%`,
              }}
            />
          </div>
          <span className="text-muted-foreground tabular-nums">
            {formatPercent(column.profile.nullPct)}
          </span>
        </div>
      </TableCell>
      <TableCell className="hidden text-right tabular-nums md:table-cell">
        {formatNumber(column.profile.distinctCount)}
      </TableCell>
      <TableCell>
        <ProfileSummary column={column} />
      </TableCell>
    </TableRow>
  )
}

function ProfileSummary({ column }: { column: DatasetColumn }) {
  const { numeric, datetime, categorical } = column.profile
  if (numeric) {
    return (
      <span className="tabular-nums">
        {formatNumber(numeric.min)} to {formatNumber(numeric.max)}
        <span className="text-muted-foreground">
          , median {formatNumber(numeric.median)}
        </span>
      </span>
    )
  }
  if (datetime) {
    return (
      <span>
        {formatDate(datetime.min)} to {formatDate(datetime.max)}
        <span className="text-muted-foreground">, by {datetime.grain}</span>
      </span>
    )
  }
  if (categorical?.top.length) {
    const top = categorical.top.slice(0, 3)
    return (
      <span className="line-clamp-1">
        {top.map((t) => t.value).join(", ")}
        {column.profile.distinctCount > top.length ? (
          <span className="text-muted-foreground">
            {" "}
            and {formatNumber(column.profile.distinctCount - top.length)} more
          </span>
        ) : null}
      </span>
    )
  }
  return <span className="text-muted-foreground">No values</span>
}
