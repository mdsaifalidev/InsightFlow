"use client"

import * as React from "react"
import Link from "next/link"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"

export type Crumb = { label: string; href?: string }

const BreadcrumbContext = React.createContext<{
  crumbs: Crumb[]
  setCrumbs: (crumbs: Crumb[]) => void
} | null>(null)

export function BreadcrumbProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [crumbs, setCrumbs] = React.useState<Crumb[]>([])
  const value = React.useMemo(() => ({ crumbs, setCrumbs }), [crumbs])
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  )
}

/** Pages declare their trail; the header renders it. */
export function useBreadcrumbs(crumbs: Crumb[]) {
  const context = React.useContext(BreadcrumbContext)
  const key = JSON.stringify(crumbs)
  React.useEffect(() => {
    context?.setCrumbs(JSON.parse(key) as Crumb[])
  }, [context?.setCrumbs, key]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function HeaderBreadcrumbs() {
  const crumbs = React.useContext(BreadcrumbContext)?.crumbs ?? []
  if (!crumbs.length) return null

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1
          return (
            <React.Fragment key={`${crumb.label}-${i}`}>
              {i > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem
                className={last ? "min-w-0" : "hidden sm:inline-flex"}
              >
                {last || !crumb.href ? (
                  <BreadcrumbPage className="truncate">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
