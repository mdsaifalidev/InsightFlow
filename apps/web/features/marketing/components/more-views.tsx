"use client"

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { AppFrame } from "./app-frame"
import { Band } from "./band"
import { Reveal } from "./reveal"

/**
 * The product in four views, on one stage.
 *
 * This retires the old two-screenshot section and puts all eight committed
 * captures on the page -- including brief-{light,dark}.png, which had been
 * captured, committed and rendered nowhere.
 *
 * The four captures have three different shapes, so the stage is letterboxed to
 * a fixed 16:10 -- otherwise the whole page below jumps by a couple of hundred
 * pixels every time the reader switches view.
 */
const VIEWS = [
  {
    value: "dashboard",
    label: "Dashboard",
    body: "Headline numbers, then the charts the engine chose and ranked, all driven by the same filters.",
    src: "/screenshots/dashboard-light.png",
    darkSrc: "/screenshots/dashboard-dark.png",
    alt: "The InsightFlow dashboard: headline numbers and charts built automatically from an orders export.",
  },
  {
    value: "brief",
    label: "Brief",
    body: "What changed, in a paragraph you can quote, with every figure linked to the point it came from.",
    src: "/screenshots/brief-light.png",
    darkSrc: "/screenshots/brief-dark.png",
    alt: "The written brief, with every grounded number marked in amber.",
  },
  {
    value: "table",
    label: "Table",
    body: "Sort and page through the underlying rows on the server, filtered by the same controls as the charts.",
    src: "/screenshots/table-light.png",
    darkSrc: "/screenshots/table-dark.png",
    alt: "The table view: sortable, paginated rows of the orders dataset.",
  },
  {
    value: "builder",
    label: "Chart builder",
    body: "Pick a dimension, a measure and an aggregation. The preview is a real query, so you see the answer before you keep it.",
    src: "/screenshots/chart-builder-light.png",
    darkSrc: "/screenshots/chart-builder-dark.png",
    alt: "The chart builder dialog, previewing total quantity by category as a bar chart.",
  },
]

export function MoreViews() {
  return (
    <Band
      tone="panel"
      rhythm="normal"
      width="wide"
      id="product"
      labelledBy="views-heading"
    >
      {/* fade, not rise: the tab triggers are pointer targets, and a section
          that moves relocates them between hit-test and click. */}
      <Reveal fade className="flex max-w-2xl flex-col gap-4">
        <h2
          id="views-heading"
          className="font-serif text-display-lg text-balance"
        >
          And the rows behind every number
        </h2>
      </Reveal>

      <Reveal fade className="mt-10">
        <Tabs defaultValue="dashboard" className="gap-6">
          <TabsList aria-label="Product views">
            {VIEWS.map((view) => (
              <TabsTrigger key={view.value} value={view.value}>
                {view.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {VIEWS.map((view) => (
            <TabsContent
              key={view.value}
              value={view.value}
              className="flex min-w-0 flex-col gap-5"
            >
              <p className="max-w-2xl text-body text-muted-foreground">
                {view.body}
              </p>
              <AppFrame
                src={view.src}
                darkSrc={view.darkSrc}
                alt={view.alt}
                fixedAspect
              />
            </TabsContent>
          ))}
        </Tabs>
      </Reveal>
    </Band>
  )
}
