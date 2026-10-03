"use client"

import * as React from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { datasetKeys } from "../api"
import { setJobFinishedHandler, stopAllJobs } from "../job-tracker"

/** Connects job completion to the query cache and toasts. Mounted once in the app shell. */
export function JobTrackerBridge() {
  const queryClient = useQueryClient()
  const router = useRouter()

  React.useEffect(() => {
    setJobFinishedHandler((job) => {
      void queryClient.invalidateQueries({ queryKey: datasetKeys.all })
      if (job.kind === "insight") {
        if (job.status === "ready") toast.success("Brief updated")
        else
          toast.error("The brief couldn't be regenerated", {
            description: job.errorMessage,
          })
        return
      }
      if (job.status === "ready") {
        toast.success(`${job.name} is ready`, {
          action: {
            label: "Open",
            onClick: () => router.push(`/app/datasets/${job.datasetId}`),
          },
        })
      } else {
        toast.error(`${job.name} couldn't be processed`, {
          description: job.errorMessage,
        })
      }
    })
    return () => {
      setJobFinishedHandler(null)
      stopAllJobs()
    }
  }, [queryClient, router])

  return null
}
