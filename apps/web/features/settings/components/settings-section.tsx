import { cn } from "@workspace/ui/lib/utils"

/**
 * One settings topic: what it is on the left, its controls on the right,
 * hairlines between topics. Replaces a stack of identical cards, where every
 * section had the same box, the same weight and its own footer bar.
 */
export function SettingsSection({
  id,
  title,
  description,
  tone,
  children,
}: {
  id: string
  title: string
  description?: React.ReactNode
  tone?: "destructive"
  children: React.ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-4 border-t border-border-soft py-6 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-10"
    >
      <div className="flex flex-col gap-1">
        <h2
          id={id}
          className={cn(
            "text-section",
            tone === "destructive" && "text-destructive"
          )}
        >
          {title}
        </h2>
        {description ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  )
}

/** Right-aligned actions under a section's fields. */
export function SettingsActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2">{children}</div>
}
