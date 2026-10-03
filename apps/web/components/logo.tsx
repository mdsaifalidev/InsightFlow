import { cn } from "@workspace/ui/lib/utils"

/** Mark: a trend line resolving into a single highlighted point. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={cn("size-6 shrink-0", className)}
    >
      <rect width="24" height="24" rx="6" className="fill-primary" />
      <path
        d="M5 15.5 9 12l3 2.5 5.5-6"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="17.5" cy="8.5" r="2.25" className="fill-signal" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-base font-semibold tracking-tight">
        InsightFlow
      </span>
    </span>
  )
}
