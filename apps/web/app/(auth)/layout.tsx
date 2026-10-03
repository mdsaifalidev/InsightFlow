import Link from "next/link"

import { MSWProvider } from "@/mocks/msw-provider"
import { Logo } from "@/components/logo"
import { BriefSpecimen } from "@/features/auth/components/brief-specimen"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <MSWProvider>
      <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="flex flex-col gap-10 p-4 sm:p-8">
          <Link href="/" className="self-start rounded-md">
            <Logo />
          </Link>
          <main className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-sm">{children}</div>
          </main>
        </div>
        <aside
          data-tone="ink"
          className="dark hidden items-center justify-center border-l border-border-soft bg-background p-12 text-foreground lg:flex"
        >
          <BriefSpecimen />
        </aside>
      </div>
    </MSWProvider>
  )
}
