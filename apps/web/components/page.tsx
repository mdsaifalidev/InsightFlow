import { cn } from "@workspace/ui/lib/utils"

/**
 * Standard page frame inside the app shell. A div, not <main>: SidebarInset
 * already renders the page's main landmark. min-w-0 lets wide children (the
 * row explorer) scroll inside themselves instead of widening the page.
 */
export function Page({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl min-w-0 flex-1 flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6",
        className
      )}
      {...props}
    />
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-title">{title}</h1>
        {description ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
