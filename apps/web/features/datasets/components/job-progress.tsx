"use client"

import { CheckIcon, CircleIcon } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { Progress } from "@workspace/ui/components/progress"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useTiming } from "@/features/marketing/motion"

import { INGEST_STAGES } from "../constants"
import { useJobState } from "../job-tracker"

/** Stage checklist for an ingest job, fed by the shared SSE job tracker. */
export function JobProgress({
  jobId,
  className,
}: {
  jobId: string
  className?: string
}) {
  const job = useJobState(jobId)
  const { reveal } = useTiming()
  const activeIndex = job
    ? job.status === "ready"
      ? INGEST_STAGES.length
      : INGEST_STAGES.findIndex((s) => s.stage === job.stage)
    : 0

  const label =
    job?.status === "ready"
      ? "Ready"
      : job?.status === "failed"
        ? "Processing stopped"
        : (job?.message ?? "Connecting")

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-4 text-sm">
          <span className="font-medium" aria-live="polite">
            {/* The stage crosses over rather than snapping: the pipeline is
                streaming, so the label should read as handover, not replacement. */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={label}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={reveal}
                className="inline-block"
              >
                {label}
              </motion.span>
            </AnimatePresence>
          </span>
          <span className="text-muted-foreground tabular-nums">
            {job?.progress ?? 0}%
          </span>
        </div>
        <Progress value={job?.progress ?? 0} aria-label="Processing progress" />
      </div>
      <ol className="flex flex-col gap-2.5">
        {INGEST_STAGES.map((item, index) => {
          const failedHere =
            job?.status === "failed" && index === Math.max(activeIndex, 0)
          const state =
            index < activeIndex
              ? "done"
              : index === activeIndex && !failedHere
                ? "active"
                : failedHere
                  ? "failed"
                  : "pending"
          return (
            <li
              key={item.stage}
              className={cn(
                "flex items-center gap-2.5 text-sm",
                state === "pending" && "text-muted-foreground",
                state === "failed" && "text-destructive"
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center">
                {state === "done" ? (
                  <CheckIcon className="size-4 text-primary" />
                ) : state === "active" ? (
                  <Spinner className="size-4" />
                ) : (
                  <CircleIcon className="size-2.5" />
                )}
              </span>
              {item.label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
