import type { Metadata } from "next"

import { AuthPageHeader } from "@/features/auth/components/auth-page-header"
import { RegisterForm } from "@/features/auth/components/register-form"

export const metadata: Metadata = { title: "Create account" }

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-8">
      <AuthPageHeader
        title="Create your account"
        description="Upload a spreadsheet and get a dashboard with a written brief of what changed."
      />
      <RegisterForm />
    </div>
  )
}
