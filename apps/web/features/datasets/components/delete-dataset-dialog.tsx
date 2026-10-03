"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "sonner"

import type { Dataset } from "@/lib/api/types"

import { useDeleteDataset } from "../api"

export function DeleteDatasetDialog({
  dataset,
  open,
  onOpenChange,
  onDeleted,
}: {
  dataset: Pick<Dataset, "id" | "name">
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const remove = useDeleteDataset()

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {dataset.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the file, its dashboard, saved charts and AI brief. You
            can&apos;t undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={remove.isPending}
            onClick={(event) => {
              event.preventDefault()
              remove.mutate(dataset.id, {
                onSuccess: () => {
                  onOpenChange(false)
                  toast.success("Dataset deleted")
                  onDeleted?.()
                },
                onError: (error) =>
                  toast.error("Couldn't delete the dataset", {
                    description: error.message,
                  }),
              })
            }}
          >
            {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
            Delete dataset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
