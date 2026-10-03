import { MSWProvider } from "@/mocks/msw-provider"
import { AuthGate } from "@/features/auth/components/auth-gate"
import { AppShell } from "@/features/shell/app-shell"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MSWProvider>
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    </MSWProvider>
  )
}
