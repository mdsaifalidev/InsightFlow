"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { z } from "zod"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import { toast } from "sonner"

import { Page, PageHeader } from "@/components/page"
import { useDeleteAccount, useMe, useUpdateMe } from "@/features/auth/api"
import { applyServerErrors } from "@/features/auth/form-errors"
import { useBreadcrumbs } from "@/features/shell/breadcrumbs"

import { MockControls } from "./mock-controls"
import { SettingsActions, SettingsSection } from "./settings-section"

import { dataMode, mswEnabled } from "@/lib/backend-mode"

// Demo controls drive the mock data layer, so they only show while it's in use.
const showMockControls = mswEnabled && dataMode === "mock"

export function SettingsView() {
  useBreadcrumbs([{ label: "Settings" }])
  const { data } = useMe()

  return (
    <Page className="max-w-5xl gap-2">
      <PageHeader
        title="Settings"
        description="Your profile, password and account."
      />
      <div className="mt-4">
        {data ? (
          <ProfileCard name={data.user.name} email={data.user.email} />
        ) : (
          <Skeleton className="my-6 h-32" />
        )}
        <PasswordCard />
        {showMockControls ? <MockControls /> : null}
        <DangerZone />
      </div>
    </Page>
  )
}

const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
})

function ProfileCard({ name, email }: { name: string; email: string }) {
  const update = useUpdateMe()
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name },
  })
  const { errors, isDirty } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values)
      form.reset(values)
      toast.success("Profile saved")
    } catch (error) {
      const message = applyServerErrors(error, form.setError, ["name"])
      if (message)
        toast.error("Couldn't save your profile", { description: message })
    }
  })

  return (
    <SettingsSection
      id="settings-profile"
      title="Profile"
      description={`Signed in as ${email}.`}
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex max-w-lg flex-col gap-4"
      >
        <FieldGroup>
          <Field data-invalid={!!errors.name}>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input
              id="profile-name"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
            <FieldError errors={[errors.name]} />
          </Field>
        </FieldGroup>
        <SettingsActions>
          <Button type="submit" disabled={!isDirty || update.isPending}>
            {update.isPending ? <Spinner data-icon="inline-start" /> : null}
            Save profile
          </Button>
        </SettingsActions>
      </form>
    </SettingsSection>
  )
}

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(8, "Use at least 8 characters."),
})

function PasswordCard() {
  const update = useUpdateMe()
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values)
      form.reset()
      toast.success("Password changed")
    } catch (error) {
      const message = applyServerErrors(error, form.setError, [
        "currentPassword",
        "newPassword",
      ])
      if (message)
        toast.error("Couldn't change your password", { description: message })
    }
  })

  return (
    <SettingsSection
      id="settings-password"
      title="Password"
      description="Use at least 8 characters."
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex max-w-lg flex-col gap-4"
      >
        <FieldGroup>
          <Field data-invalid={!!errors.currentPassword}>
            <FieldLabel htmlFor="current-password">Current password</FieldLabel>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.currentPassword}
              {...form.register("currentPassword")}
            />
            <FieldError errors={[errors.currentPassword]} />
          </Field>
          <Field data-invalid={!!errors.newPassword}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...form.register("newPassword")}
            />
            <FieldError errors={[errors.newPassword]} />
          </Field>
        </FieldGroup>
        <SettingsActions>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? <Spinner data-icon="inline-start" /> : null}
            Change password
          </Button>
        </SettingsActions>
      </form>
    </SettingsSection>
  )
}

function DangerZone() {
  const remove = useDeleteAccount()
  const [open, setOpen] = React.useState(false)

  return (
    <SettingsSection
      id="settings-delete"
      title="Delete account"
      tone="destructive"
      description="Permanently removes your account, workspace, datasets, dashboards and briefs."
    >
      <div>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">Delete account</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                Everything in your workspace is deleted. You can&apos;t undo
                this.
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
                  remove.mutate(undefined, {
                    onSuccess: () => toast.success("Account deleted"),
                    onError: (error) =>
                      toast.error("Couldn't delete your account", {
                        description: error.message,
                      }),
                  })
                }}
              >
                {remove.isPending ? <Spinner data-icon="inline-start" /> : null}
                Delete account
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </SettingsSection>
  )
}
