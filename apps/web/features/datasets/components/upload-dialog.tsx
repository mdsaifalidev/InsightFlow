"use client"

import * as React from "react"
import Link from "next/link"
import { FileSpreadsheetIcon, UploadIcon } from "lucide-react"
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { formatBytes } from "@/lib/format"

import { useUploadDataset } from "../api"
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from "../constants"
import { useJobState } from "../job-tracker"
import { JobProgress } from "./job-progress"

export type StartedJob = { jobId: string; datasetId: string; name: string }

export function validateFile(file: File): string | null {
  const extension = `.${file.name.split(".").pop()?.toLowerCase()}`
  if (!ACCEPTED_EXTENSIONS.includes(extension)) {
    return "Choose a .csv or .xlsx file."
  }
  if (file.size === 0) return "This file is empty."
  if (file.size > MAX_UPLOAD_BYTES) {
    return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`
  }
  return null
}

function stripExtension(filename: string) {
  return filename.replace(/\.[^.]+$/, "")
}

export function UploadDialog({
  open,
  onOpenChange,
  startedJob,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Opens straight into progress for a job started elsewhere (samples). */
  startedJob?: StartedJob | null
}) {
  const [job, setJob] = React.useState<StartedJob | null>(null)
  const activeJob = job ?? startedJob ?? null

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next)
    // Reset after the close animation; an in-flight job keeps running.
    if (!next) setTimeout(() => setJob(null), 200)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {activeJob ? (
          <ProcessingStep job={activeJob} onRetry={() => setJob(null)} />
        ) : (
          <SelectStep onStarted={setJob} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function SelectStep({ onStarted }: { onStarted: (job: StartedJob) => void }) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [progress, setProgress] = React.useState<number | null>(null)
  const upload = useUploadDataset()

  const choose = (next: File | undefined) => {
    if (!next) return
    const problem = validateFile(next)
    setError(problem)
    setFile(problem ? null : next)
    if (!problem) setName(stripExtension(next.name))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!file) {
      setError("Choose a file to upload.")
      return
    }
    upload.mutate(
      { file, name, onProgress: setProgress },
      {
        onSuccess: ({ dataset, jobId }) =>
          onStarted({ jobId, datasetId: dataset.id, name: dataset.name }),
        onError: (e) => setError(e.message || "The upload failed. Try again."),
      }
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <DialogHeader>
        <DialogTitle>Upload a file</DialogTitle>
        <DialogDescription>
          CSV or Excel, up to {formatBytes(MAX_UPLOAD_BYTES)}. The first row
          should hold column names.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <Field data-invalid={!!error}>
          <FieldLabel htmlFor="upload-file" className="sr-only">
            File
          </FieldLabel>
          <div
            role="button"
            tabIndex={0}
            aria-describedby="upload-hint"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                inputRef.current?.click()
              }
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              choose(e.dataTransfer.files[0])
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-muted/30 p-8 text-center transition-colors",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dragging ? "border-primary bg-accent" : "hover:bg-muted/50",
              error && "border-destructive"
            )}
          >
            {file ? (
              <>
                <FileSpreadsheetIcon className="size-6 text-foreground" />
                <span className="max-w-full truncate text-sm font-medium">
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(file.size)}. Click to choose a different file.
                </span>
              </>
            ) : (
              <>
                <UploadIcon className="size-6 text-muted-foreground" />
                <span className="text-sm font-medium">
                  Drop a file here or click to browse
                </span>
                <span
                  id="upload-hint"
                  className="text-xs text-muted-foreground"
                >
                  .csv or .xlsx
                </span>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            id="upload-file"
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              choose(e.target.files?.[0])
              e.target.value = ""
            }}
          />
          {error ? <FieldError>{error}</FieldError> : null}
        </Field>

        {file ? (
          <Field>
            <FieldLabel htmlFor="dataset-name">Dataset name</FieldLabel>
            <Input
              id="dataset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <FieldDescription>
              Shown in your library and on the dashboard.
            </FieldDescription>
          </Field>
        ) : null}

        {upload.isPending ? (
          <Field>
            <Progress
              value={progress === null ? undefined : Math.round(progress * 100)}
              aria-label="Upload progress"
            />
            <FieldDescription>
              {progress === null
                ? "Uploading"
                : `Uploading ${Math.round(progress * 100)}%`}
            </FieldDescription>
          </Field>
        ) : null}
      </FieldGroup>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" disabled={upload.isPending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!file || upload.isPending}>
          {upload.isPending ? <Spinner data-icon="inline-start" /> : null}
          Upload
        </Button>
      </DialogFooter>
    </form>
  )
}

function ProcessingStep({
  job,
  onRetry,
}: {
  job: StartedJob
  onRetry: () => void
}) {
  const state = useJobState(job.jobId)

  return (
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle className="truncate">{job.name}</DialogTitle>
        <DialogDescription>
          {state?.status === "ready"
            ? "Your dashboard and brief are ready."
            : state?.status === "failed"
              ? "We couldn't process this file."
              : "You can close this window; processing continues and you'll get a notification."}
        </DialogDescription>
      </DialogHeader>

      <JobProgress jobId={job.jobId} />

      {state?.status === "failed" ? (
        <Alert variant="destructive">
          <AlertTitle>Processing failed</AlertTitle>
          <AlertDescription>{state.errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <DialogFooter>
        {state?.status === "failed" ? (
          <Button onClick={onRetry}>Choose another file</Button>
        ) : state?.status === "ready" ? (
          <>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button asChild>
                <Link href={`/app/datasets/${job.datasetId}`}>
                  Open dashboard
                </Link>
              </Button>
            </DialogClose>
          </>
        ) : (
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        )}
      </DialogFooter>
    </div>
  )
}
