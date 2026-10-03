import { cn } from "@workspace/ui/lib/utils"

import { Band } from "./band"
import { Reveal, RevealGroup, RevealItem } from "./reveal"

// Each step shows the thing rather than an icon of the thing: three raw rows,
// a real series, a line of the real brief. The icon-in-a-tinted-rounded-square
// is the single most recognisable Tailwind-template shape there is.
const STEPS = [
  {
    title: "Drop in a file",
    body: "CSV or Excel, up to 100 MB. Column names come from the first row; types are inferred and you can correct any of them.",
    stages: "Uploading · Parsing",
  },
  {
    title: "Get a dashboard",
    body: "Every column is profiled, then the charts that suit your data are built for you — trends over time, category breakdowns, distributions, ranked so the most interesting one leads.",
    stages: "Profiling · Building dashboard",
  },
  {
    title: "Read what changed",
    body: "A short brief explains the movements and the anomalies, and links each number to the exact point on the chart it came from.",
    stages: "Generating the brief",
  },
]

// Four, not six. "Charts chosen for you" and "Live progress" used to sit here
// and were cut, not lost: the first is step 02 and the second is the stage
// column those steps already carry on the right. What is left is the work a
// reader can do *after* the dashboard exists, which is the only part the step
// ledger above does not already say.
const CAPABILITIES = [
  {
    title: "Filters that hold up",
    body: "A date range and up to five category filters, applied on the server to every widget at once. The state lives in the URL, so a view is a link.",
  },
  {
    title: "Build your own chart",
    body: "Pick a dimension, a measure and an aggregation, watch the preview update, then keep it on the dashboard.",
  },
  {
    title: "Fix a wrong type",
    body: "Override any column's type and the file is re-profiled and the dashboard rebuilt around it.",
  },
  {
    title: "The rows, too",
    body: "A sortable, paginated table of the underlying data, filtered by the same controls as the charts.",
  },
]

export function HowItWorks() {
  return (
    <Band
      tone="canvas"
      rhythm="normal"
      width="content"
      id="how"
      labelledBy="how-heading"
    >
      <Reveal className="flex max-w-2xl flex-col gap-4">
        <h2
          id="how-heading"
          className="font-serif text-display-lg text-balance"
        >
          This needs a file.
        </h2>
        <p className="text-subhead text-muted-foreground">
          Metabase, Looker and Power BI want a connector, a data model and a
          chart you build yourself before they show you anything. There is no
          step here that is called &ldquo;configure a data source&rdquo;.
        </p>
      </Reveal>

      {/* A ruled ledger, not three cards. Rules let three rows read as a
          sequence; three bordered boxes read as three unrelated things. */}
      <RevealGroup as="ol" className="mt-12 flex flex-col">
        {STEPS.map((step, i) => (
          <RevealItem
            as="li"
            key={step.title}
            className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-baseline gap-x-5 gap-y-2 border-t border-border-soft py-6 sm:grid-cols-[3rem_minmax(0,16rem)_minmax(0,1fr)_auto] sm:gap-x-8"
          >
            <span className="text-data-lg text-muted-foreground/50 tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-headline">{step.title}</h3>
            <p className="col-start-2 text-body text-muted-foreground sm:col-start-3">
              {step.body}
            </p>
            {/* Mono for the machine's own vocabulary -- these are the stage
                names the job actually streams, so they wear the same face as
                the raw CSV pane rather than the prose face. */}
            <p className="col-start-2 font-mono text-mono-sm text-muted-foreground/70 sm:col-start-4 sm:text-right">
              {step.stages}
            </p>
          </RevealItem>
        ))}
      </RevealGroup>

      {/* Subordinate on purpose. This used to be its own canvas band with its
          own display-lg heading, directly below this one -- two identical
          structures in the same tone, which read as the page repeating itself
          rather than continuing. It is one band now, and the second heading
          steps down to headline so the hierarchy says "still Setup". */}
      <Reveal className="mt-16 flex max-w-2xl flex-col gap-3">
        <h3 className="text-headline text-balance">
          Not a blank canvas asking you to build a chart.
        </h3>
        <p className="text-body text-muted-foreground">
          A finished starting point you can change — every column profiled, the
          charts chosen and ranked, the brief written, before you touch
          anything.
        </p>
      </Reveal>

      <RevealGroup as="dl" className="mt-8 grid grid-cols-1 sm:grid-cols-2">
        {CAPABILITIES.map((capability, i) => (
          <RevealItem
            key={capability.title}
            className={cn(
              "flex min-w-0 flex-col gap-1.5 border-t border-border-soft py-5",
              // Grid-line discipline: a hairline between the columns instead
              // of a gutter of air, so the pairs read as one ruled table and
              // not as four floating blocks. The rule is only drawn at sm and
              // up, where there are two columns for it to sit between.
              i % 2 === 1 ? "sm:border-l sm:pl-10" : "sm:pr-10"
            )}
          >
            <dt className="text-card-title">{capability.title}</dt>
            <dd className="text-body-sm text-muted-foreground">
              {capability.body}
            </dd>
          </RevealItem>
        ))}
      </RevealGroup>
    </Band>
  )
}
