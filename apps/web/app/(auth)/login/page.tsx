import type { Metadata } from "next"
import { Suspense } from "react"

import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = { title: "Sign in" }

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-8">
      <AuthPageHeader
        title="Sign in"
        description="Welcome back. Your datasets are where you left them."
      />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
