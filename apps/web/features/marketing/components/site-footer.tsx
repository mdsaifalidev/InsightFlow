"use client"

import Link from "next/link"

import { LogoMark } from "@/components/logo"
import { useAuthSession } from "@/features/auth/api"

const SIGNED_OUT_LINKS = [
  { href: "/login", label: "Sign in" },
  { href: "/register", label: "Create account" },
]

const SIGNED_IN_LINKS = [{ href: "/app/datasets", label: "Open app" }]

export function SiteFooter() {
  const { isAuthenticated } = useAuthSession()
  const links = isAuthenticated ? SIGNED_IN_LINKS : SIGNED_OUT_LINKS

  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LogoMark className="size-5" />
          <span>
            © {new Date().getFullYear()} InsightFlow — a portfolio project by{" "}
            <a
              href="https://buildwithsaif.vercel.app"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-primary"
            >
              Md Saif Ali
            </a>
          </span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          <a
            href="https://buildwithsaif.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            Portfolio
          </a>
          <a
            href="https://stats.uptimerobot.com/AMVhQAA8Yz"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            Status
          </a>
        </nav>
      </div>
    </footer>
  )
}
