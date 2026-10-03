"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { DatabaseIcon, SettingsIcon } from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

import { LogoMark } from "@/components/logo"
import { useMe } from "@/features/auth/api"
import { useDatasets } from "@/features/datasets/api"

import { NavUser } from "./nav-user"

const RECENT_LIMIT = 5

export function AppSidebar() {
  const pathname = usePathname()
  const { data } = useMe()
  // Recent datasets nest under Datasets: they are places inside that section,
  // not a second navigation. The list query is already cached by the datasets
  // page, so this is a cache read in the common case.
  const datasets = useDatasets({ q: "", sort: "newest" })
  const recent = (datasets.data?.items ?? []).slice(0, RECENT_LIMIT)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-12 justify-center border-b border-sidebar-border py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-9 group-data-[collapsible=icon]:p-1!"
            >
              <Link href="/app/datasets">
                {/* Wrapped: the button forces direct svg children to size-4. */}
                <div className="flex size-6 shrink-0 items-center justify-center">
                  <LogoMark className="size-6" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold text-sidebar-foreground">
                    InsightFlow
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {data?.workspace.name ?? " "}
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/app/datasets"}
                  tooltip="Datasets"
                >
                  <Link href="/app/datasets">
                    <DatabaseIcon />
                    <span>Datasets</span>
                  </Link>
                </SidebarMenuButton>
                {recent.length ? (
                  <SidebarMenuSub className="mt-0.5">
                    {recent.map((dataset) => (
                      <SidebarMenuSubItem key={dataset.id}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname.startsWith(
                            `/app/datasets/${dataset.id}`
                          )}
                        >
                          <Link href={`/app/datasets/${dataset.id}`}>
                            <span>{dataset.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-1 border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={pathname.startsWith("/app/settings")}
              tooltip="Settings"
            >
              <Link href="/app/settings">
                <SettingsIcon />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
