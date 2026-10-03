"use client"

import * as React from "react"
import { DatabaseIcon, SearchIcon, UploadIcon } from "lucide-react"
import {
  debounce,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from "nuqs"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { toast } from "sonner"

import { Page, PageHeader } from "@/components/page"
import type { SampleKey } from "@/lib/api/types"
import { useBreadcrumbs } from "@/features/shell/breadcrumbs"

import { useCreateSample, useDatasets, type DatasetSort } from "../api"
import { DatasetsTable } from "./datasets-table"
import { SAMPLES } from "../samples"
import { SampleMenu } from "./sample-picker"
import { UploadDialog, type StartedJob } from "./upload-dialog"

const sortOptions: { value: DatasetSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "name", label: "Name" },
  { value: "rows", label: "Most rows" },
]

const searchParams = {
  q: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(["newest", "name", "rows"] as const).withDefault(
    "newest"
  ),
}

export function DatasetsView() {
  useBreadcrumbs([{ label: "Datasets" }])
  const [{ q, sort }, setParams] = useQueryStates(searchParams)
  const [search, setSearch] = React.useState(q)
  const deferredQ = React.useDeferredValue(q)
  const datasets = useDatasets({ q: deferredQ, sort })

  const [uploadOpen, setUploadOpen] = React.useState(false)
  const [startedJob, setStartedJob] = React.useState<StartedJob | null>(null)
  const createSample = useCreateSample()

  const openUpload = () => {
    setStartedJob(null)
    setUploadOpen(true)
  }

  const startSample = (key: SampleKey) => {
    createSample.mutate(key, {
      onSuccess: ({ dataset, jobId }) => {
        setStartedJob({ jobId, datasetId: dataset.id, name: dataset.name })
        setUploadOpen(true)
      },
      onError: (error) =>
        toast.error("Couldn't add the sample", { description: error.message }),
    })
  }

  const items = datasets.data?.items ?? []
  const libraryEmpty = !datasets.isPending && !q && items.length === 0

  return (
    <Page>
      <PageHeader
        title="Datasets"
        description="Files you've uploaded and the dashboards built from them."
        actions={
          libraryEmpty ? null : (
            <>
              <SampleMenu
                onPick={startSample}
                disabled={createSample.isPending}
              />
              <Button onClick={openUpload}>
                <UploadIcon data-icon="inline-start" />
                Upload file
              </Button>
            </>
          )
        }
      />

      {libraryEmpty ? (
        <EmptyLibrary
          onUpload={openUpload}
          onSample={startSample}
          pendingSample={
            createSample.isPending ? createSample.variables : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <InputGroup className="w-full sm:max-w-xs">
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                type="search"
                placeholder="Search datasets"
                aria-label="Search datasets"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  void setParams(
                    { q: e.target.value || null },
                    { limitUrlUpdates: debounce(250) }
                  )
                }}
              />
            </InputGroup>
            <Select
              value={sort}
              onValueChange={(value) =>
                void setParams({ sort: value as DatasetSort })
              }
            >
              <SelectTrigger className="w-40" aria-label="Sort datasets">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {sortOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          {datasets.isPending ? (
            <div className="flex flex-col gap-2 rounded-lg bg-card p-4 shadow-e1 ring-1 ring-border-soft">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : datasets.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t load your datasets</AlertTitle>
              <AlertDescription>
                {datasets.error.message}{" "}
                <Button
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => void datasets.refetch()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : items.length === 0 ? (
            <Empty className="border border-dashed border-border-strong">
              <EmptyHeader>
                <EmptyTitle>No datasets match &ldquo;{q}&rdquo;</EmptyTitle>
                <EmptyDescription>
                  Try a different name or clear the search.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("")
                    void setParams({ q: null })
                  }}
                >
                  Clear search
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <DatasetsTable datasets={items} />
          )}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        startedJob={startedJob}
      />
    </Page>
  )
}

function EmptyLibrary({
  onUpload,
  onSample,
  pendingSample,
}: {
  onUpload: () => void
  onSample: (key: SampleKey) => void
  pendingSample?: SampleKey
}) {
  return (
    <Empty className="border border-dashed border-border-strong">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <DatabaseIcon />
        </EmptyMedia>
        <EmptyTitle>Start with a file</EmptyTitle>
        <EmptyDescription>
          Upload a CSV or Excel export and InsightFlow builds a dashboard and a
          written brief of what changed. No file handy? Try a sample.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-2xl">
        <Button onClick={onUpload}>
          <UploadIcon data-icon="inline-start" />
          Upload file
        </Button>
        <div className="grid w-full gap-2 text-left sm:grid-cols-3">
          {SAMPLES.map((sample) => (
            <Button
              key={sample.key}
              variant="outline"
              className="h-auto flex-col items-start gap-1 p-3 text-left whitespace-normal"
              onClick={() => onSample(sample.key)}
              disabled={!!pendingSample}
            >
              <span className="font-medium">{sample.name}</span>
              <span className="text-xs font-normal text-muted-foreground">
                {sample.description}
              </span>
            </Button>
          ))}
        </div>
      </EmptyContent>
    </Empty>
  )
}
