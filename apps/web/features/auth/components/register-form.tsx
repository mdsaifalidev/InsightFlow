"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useRegister } from "../api"
import { applyServerErrors } from "../form-errors"
import { registerSchema, type RegisterValues } from "../schemas"

export function RegisterForm() {
  const router = useRouter()
  const register = useRegister()
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "" },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await register.mutateAsync(values)
      router.replace("/app/datasets")
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ["name", "email", "password"])
      )
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        {formError ? (
          <Alert variant="destructive">
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        ) : null}
        <Field data-invalid={!!errors.name}>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            autoComplete="name"
            autoFocus
            aria-invalid={!!errors.name}
            {...form.register("name")}
          />
          <FieldError errors={[errors.name]} />
        </Field>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Work email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!errors.email}
            {...form.register("email")}
          />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          {errors.password ? (
            <FieldError errors={[errors.password]} />
          ) : (
            <FieldDescription>At least 8 characters.</FieldDescription>
          )}
        </Field>
        <Field>
          <Button type="submit" disabled={register.isPending}>
            {register.isPending ? <Spinner data-icon="inline-start" /> : null}
            Create account
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </FieldGroup>
    </form>
  )
}
