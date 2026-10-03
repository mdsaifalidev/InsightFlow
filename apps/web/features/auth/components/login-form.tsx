"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useLogin } from "../api"
import { applyServerErrors } from "../form-errors"
import { loginSchema, type LoginValues } from "../schemas"
import { safeNextPath } from "../redirect"

export function LoginForm() {
  const router = useRouter()
  const next = safeNextPath(useSearchParams().get("next"))
  const login = useLogin()
  const [formError, setFormError] = React.useState<string | null>(null)
  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login.mutateAsync(values)
      router.replace(next)
    } catch (error) {
      setFormError(
        applyServerErrors(error, form.setError, ["email", "password"])
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
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
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
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...form.register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field>
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? <Spinner data-icon="inline-start" /> : null}
            Sign in
          </Button>
        </Field>
        <p className="text-center text-sm text-muted-foreground">
          New to InsightFlow?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Create an account
          </Link>
        </p>
      </FieldGroup>
    </form>
  )
}
