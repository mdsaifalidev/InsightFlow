"use client"

import { useRedirectIfSignedIn } from "./auth-gate"

export function AuthPageHeader({
  title,
  description,
}: {
  title: string
  description: string
}) {
  useRedirectIfSignedIn("/app/datasets")

  return (
    <header className="flex flex-col gap-1.5">
      <h1 className="text-title">{title}</h1>
      <p className="text-sm text-balance text-muted-foreground">
        {description}
      </p>
    </header>
  )
}
