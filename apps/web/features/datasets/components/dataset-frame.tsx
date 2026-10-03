"use client"

import * as React from "react"
import Link from "next/link"
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation"
import { FileQuestionIcon, MoreHorizontalIcon } from "lucide-react"
import { motion } from "motion/react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { cn } from "@workspace/ui/lib/utils"

import { useTiming } from "@/features/marketing/motion"

import { Page } from "@/components/page"
import { ApiError } from "@/lib/api-client"
import type { DatasetDetail } from "@/lib/api/types"
import { formatNumber, formatRelative } from "@/lib/format"
import { FilterBar } from "@/features/filters/components/filter-bar"
import { FILTER_KEYS } from "@/features/filters/params"
import { useBreadcrumbs } from "@/features/shell/breadcrumbs"

import { useDataset } from "../api"
import { DatasetStatusBadge } from "./dataset-status"
import { DeleteDatasetDialog } from "./delete-dataset-dialog"
import { JobProgress } from "./job-progress"

const DatasetContext = React.createContext<DatasetDetail | null>(null)

/** The ready dataset, for pages rendered inside DatasetFrame. */
export function useCurrentDataset() {
  const dataset = React.useContext(DatasetContext)
  if (!dataset)
    throw new Error("useCurrentDataset must be used inside DatasetFrame")
  return dataset
}

const tabs = [
  { label: "Dashboard", segment: "" },
  { label: "Table", segment: "/table" },
  { label: "Columns", segment: "/columns" },
]

/** The underline slides between tabs; it never changes a link's own box. */
function useUnderlineTransition() {
  const { instant } = useTiming()
  return instant
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 38 }
}

export function DatasetFrame({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>()
  const query = useDataset(id)

  useBreadcrumbs([
    { label: "Datasets", href: "/app/datasets" },
    { label: query.data?.name ?? "Dataset" },
  ])

  if (query.isPending) {
    return (
      <Page>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-64 w-full" />
      </Page>
    )
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404
    return (
      <Page>
        <Empty className="border border-dashed border-border-strong">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileQuestionIcon />
            </EmptyMedia>
            <EmptyTitle>
              {notFound ? "Dataset not found" : "Couldn't load this dataset"}
            </EmptyTitle>
            <EmptyDescription>
              {notFound
                ? "It may have been deleted, or the link is wrong."
                : query.error.message}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline">
              <Link href="/app/datasets">Back to datasets</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </Page>
    )
  }

  const dataset = query.data
  return (
    <Page>
      <DatasetHeader dataset={dataset} />
      {dataset.status === "ready" ? (
        <DatasetContext.Provider value={dataset}>
          <div className="flex min-w-0 flex-col gap-5">{children}</div>
        </DatasetContext.Provider>
      ) : dataset.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>This file couldn&apos;t be processed</AlertTitle>
          <AlertDescription>
            {dataset.errorMessage} Fix the file and upload it again, or delete
            this dataset.
          </AlertDescription>
        </Alert>
      ) : dataset.jobId ? (
        <Card className="max-w-xl">
          <CardContent>
            <JobProgress jobId={dataset.jobId} />
          </CardContent>
        </Card>
      ) : null}
    </Page>
  )
}

function DatasetHeader({ dataset }: { dataset: DatasetDetail }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Switching tabs keeps the filters (but not table paging/sorting).
  const filterQuery = new URLSearchParams(
    [...searchParams.entries()].filter(([key]) => FILTER_KEYS.includes(key))
  ).toString()
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const base = `/app/datasets/${dataset.id}`

  const underline = useUnderlineTransition()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-title">{dataset.name}</h1>
            <DatasetStatusBadge dataset={dataset} />
          </div>
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
            <div className="flex gap-1">
              <dt className="sr-only">File</dt>
              <dd className="truncate">{dataset.originalFilename}</dd>
            </div>
            {dataset.rowCount !== null ? (
              <div className="flex gap-1">
                <dd className="tabular-nums">
                  {formatNumber(dataset.rowCount)}
                </dd>
                <dt>rows</dt>
              </div>
            ) : null}
            {dataset.columnCount !== null ? (
              <div className="flex gap-1">
                <dd className="tabular-nums">
                  {formatNumber(dataset.columnCount)}
                </dd>
                <dt>columns</dt>
              </div>
            ) : null}
            <div className="flex gap-1">
              <dt>Added</dt>
              <dd>{formatRelative(dataset.createdAt)}</dd>
            </div>
          </dl>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Dataset actions">
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirmDelete(true)}
              >
                Delete dataset
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DeleteDatasetDialog
          dataset={dataset}
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          onDeleted={() => router.replace("/app/datasets")}
        />
      </div>

      {dataset.status === "ready" ? (
        /* Views on the left, the filters that apply to them on the right: one
           row on md+, so the dashboard starts a full row higher. On mobile the
           filters drop under the tab rule. Columns has no filters. */
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6 md:border-b">
          <nav
            aria-label="Dataset views"
            className="-mb-px flex shrink-0 gap-1 border-b md:border-b-0"
          >
            {tabs.map((tab) => {
              const path = `${base}${tab.segment}`
              const active = pathname === path
              const href =
                filterQuery && tab.segment !== "/columns"
                  ? `${path}?${filterQuery}`
                  : path
              return (
                <Link
                  key={tab.label}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    // relative: the shared underline is positioned against this.
                    // border-b-2 stays on every tab so heights never change and
                    // the links Playwright clicks are stationary.
                    "relative -mb-px rounded-md border-b-2 border-transparent px-2.5 pt-1.5 pb-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  {active ? (
                    <motion.span
                      layoutId="dataset-tab"
                      className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary"
                      transition={underline}
                    />
                  ) : null}
                </Link>
              )
            })}
          </nav>
          {pathname.endsWith("/columns") ? null : (
            <FilterBar dataset={dataset} className="md:justify-end md:pb-2" />
          )}
        </div>
      ) : null}
    </div>
  )
}
