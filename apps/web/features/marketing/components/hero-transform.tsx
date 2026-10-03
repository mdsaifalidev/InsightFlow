import { AppFrame } from "./app-frame"
import { CsvPane } from "./csv-pane"

/**
 * The claim in the headline, shown rather than described: the file on the left
 * becomes the dashboard on the right. The old page showed the "after" four
 * times and the "before" not once, while the h1 promised a spreadsheet.
 *
 * It animates in CSS scroll-driven animation (packages/ui globals.css,
 * `.hero-transform`), never in JavaScript, and the FINISHED composition is the
 * default. Three reasons, in the order they matter:
 *
 *   1. CLAUDE.md's first rule -- the hero never animates in JS. A Motion
 *      `useScroll` value inlines its initial state into the SSR HTML, which
 *      ships the hero at opacity:0, defers LCP to hydration and leaves the page
 *      blank if the bundle never arrives.
 *   2. Without support (Firefox, Safari today) or with reduced motion, the
 *      @supports / @media blocks simply never apply and the reader gets the
 *      finished side-by-side, which is still the whole argument. A Motion
 *      version cannot degrade that cleanly.
 *   3. It contains no interactive elements, on purpose, so no Playwright
 *      actionability check is ever downstream of a running animation.
 *
 * This sits in the hero's SECOND viewport, below the fold. The h1 and the CTA
 * above it stay CSS-only and paint on the first frame, so the LCP element is
 * unchanged.
 */
export function HeroTransform() {
  return (
    <div className="hero-transform relative w-full min-w-0 pb-20 text-left sm:pb-28">
      <div className="grid min-w-0 grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_auto_minmax(0,1.15fr)] lg:gap-6">
        <div className="hero-csv min-w-0">
          <CsvPane />
        </div>

        {/* The join is a rule and nothing else. Naming the columns here needed
            vertical text in a column this narrow, which was unreadable and
            clipped; the naming lives under the pane instead, where it reads. */}
        <div aria-hidden className="flex items-center justify-center">
          <span className="hero-trace h-0.5 w-10 origin-left rounded-full bg-signal" />
        </div>

        <div className="hero-deck min-w-0">
          <AppFrame
            src="/screenshots/dashboard-light.png"
            darkSrc="/screenshots/dashboard-dark.png"
            alt="The same orders file as an InsightFlow dashboard: headline numbers, a revenue trend with the April drop marked, and breakdowns by region and category."
          />
        </div>
      </div>
    </div>
  )
}
