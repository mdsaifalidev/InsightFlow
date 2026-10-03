import Link from "next/link"

import { LogoMark } from "@/components/logo"

const LINKS = [
  { href: "/login", label: "Sign in" },
  { href: "/register", label: "Create account" },
]

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LogoMark className="size-5" />
          <span>
            InsightFlow — a portfolio project by{" "}
            <span className="text-foreground">Md Saif Ali</span>
          </span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-4 text-sm">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  )
}
