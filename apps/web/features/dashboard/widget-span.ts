import type { Widget } from "@/lib/api/types"

/**
 * Which widget gets the full row.
 *
 * The rule this replaces was inline in dashboard-view and read
 * `i === 0 && widget.spec.chartType === "line"`, which silently missed `area`:
 * the weblogs auto dashboard opens with a line and an area chart, and any
 * dashboard whose lead happened to be an area chart never got the wide
 * treatment at all. That is the bug this file exists to fix and to keep fixed.
 *
 * Sizes are derived, never user-set, because there is nowhere to put a user's
 * choice: `position` is server-assigned and `PATCH /widgets/{id}` accepts
 * `spec` only. Drag-to-resize would need a new field, an endpoint and a
 * PRD §9 change.
 *
 * ## Why this is not a bento mosaic
 *
 * A mixed-span mosaic was the plan, with tiers by chart type — donuts narrower,
 * time series wider. It was built, and the real auto-dashboard shapes rejected
 * it. Packed the way `grid-flow-dense` packs, over a six-column grid:
 *
 *   tiers with a narrow donut   orders [6,6,5]  saas [6,6,6]  weblogs [6,6,5,3]
 *   every breakdown a half      orders [6,6,6]  saas [6,6,6]  weblogs [6,6,6,3]
 *
 * weblogs' `5` sits in a middle row — a stranded column that reads as a broken
 * layout, where a short last row reads as normal. Every richer tiering tried
 * produced one of those somewhere.
 *
 * The underlying reason is about content, not CSS: our dashboards are five or
 * six charts of near-equal informational weight. A bento works when the tiles
 * genuinely differ — a feed, a gauge, a table, a stat — and ours do not, yet.
 * If widget kinds diversify (a stat tile, a rows preview), revisit this with
 * the same packing check, which the tests already encode.
 */

function isTimeSeries(widget: Widget) {
  return widget.spec.chartType === "line" || widget.spec.chartType === "area"
}

/**
 * The lead trend spans both columns; everything else takes one.
 *
 * Time series earn the width: they carry 12–30 points along the x axis and go
 * unreadable when squeezed, whereas a bar chart's labels run down the y axis.
 * A lead that is not a time series gets no special treatment — width would be
 * wasted on six categories.
 */
export function widgetSpan(widget: Widget, index: number): string {
  return index === 0 && isTimeSeries(widget) ? "md:col-span-2" : ""
}
