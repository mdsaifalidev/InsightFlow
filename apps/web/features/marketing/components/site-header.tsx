import Link from "next/link"
import { Button } from "@workspace/ui/components/button"

import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#grounded", label: "Grounded AI" },
  { href: "#speed", label: "Speed" },
]

export function SiteHeader() {
  return (
    // Ink in both themes, like the hero it sits on and the CTA it ends on. A
    // light translucent bar directly above an ink band reads as broken, and once
    // scrolled it would float a pale sheet over dark content. The theme toggle
    // still lives here and still visibly flips every canvas and panel band below
    // it -- this bar is art direction, not a broken control.
    //
    // These classes are the SETTLED state, and they are also the fallback: with
    // no scroll-timeline support the header is simply always solid, which is the
    // readable one. `site-header` (globals.css) dissolves it back to transparent
    // while the reader is at the top, so the hero's ink and its glow run
    // uninterrupted behind it. bg-background/80 could not do that on its own --
    // it composites over whatever is beneath the header, which is the layout's
    // canvas, not the hero, and in the light theme that made the bar visibly
    // paler than the section under it.
    <header
      data-tone="ink"
      className="site-header dark sticky top-0 z-40 border-b border-border-soft bg-background/80 text-foreground backdrop-blur-sm"
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="rounded-md" aria-label="InsightFlow home">
          <Logo />
        </Link>
        <nav
          aria-label="Sections"
          className="hidden flex-1 items-center gap-1 md:flex"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        {/* Deliberately not personalised: reading the httpOnly session cookie
            would make the whole page dynamic, and /login already redirects a
            signed-in visitor into the app. */}
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ThemeToggle />
          <Button
            asChild
            variant="ghost"
            className="hidden h-9 px-3 sm:inline-flex"
          >
            <Link href="/login">Sign in</Link>
          </Button>
          <Button asChild className="h-9 px-4">
            <Link href="/register">Get started</Link>
          </Button>
        </div>
      </div>
    </header>
  )
}
