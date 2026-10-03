import { Band, Eyebrow } from "./band"
import { Reveal, RevealGroup, RevealItem } from "./reveal"

// Measured, never estimated (infra/benchmarks/RESULTS.md): a 1,000,000-row,
// 86.7 MB CSV on a 2-core i7-6600U laptop against the dev containers.
const NUMBERS = [
  {
    value: "12.5s",
    label: "to a finished dashboard",
    detail: "1,000,000 rows and 12 columns, parsed, profiled and charted.",
  },
  {
    value: "19ms",
    label: "before the page is yours again",
    detail: "The upload is accepted as it streams; the work moves to a queue.",
  },
  {
    value: "377ms",
    label: "to re-filter everything",
    detail: "95th percentile, all charts and headline numbers in one request.",
  },
]

const RUNTIMES = [
  {
    name: "Next.js",
    role: "The interface, streaming each widget in as its data lands.",
  },
  {
    name: "Node.js · Fastify",
    role: "Accounts and sessions, where latency per request matters most.",
  },
  {
    name: "Python · Polars",
    role: "Parsing, profiling and every query — the part that would block anything else.",
  },
]

// Stating a limit proves the thing exists and was measured. Every line here is
// true of the shipped product (docs/PRD.md §F2, §F3).
const LIMITS = [
  { term: "Formats", detail: "CSV and Excel (.xlsx). The first sheet only." },
  { term: "Size", detail: "Up to 100 MB per file." },
  {
    term: "Types",
    detail:
      "Six inferred per column — numeric, categorical, datetime, boolean, text, id — and you can override any of them.",
  },
  {
    term: "Filters",
    detail: "A date range and up to five category filters, kept in the URL.",
  },
  {
    term: "Not this",
    detail:
      "No database connectors, no data modelling layer, no scheduled refresh, no writing back to your systems.",
  },
]

export function Speed() {
  return (
    <Band
      tone="canvas"
      rhythm="normal"
      width="content"
      id="speed"
      labelledBy="speed-heading"
    >
      <Reveal className="flex max-w-2xl flex-col gap-4">
        <h2
          id="speed-heading"
          className="font-serif text-display-lg text-balance"
        >
          Fast on a million rows, and it stays that way
        </h2>
        <p className="text-subhead text-muted-foreground">
          Heavy work never runs where you are waiting. Each job goes to the
          runtime suited to it, so the page keeps responding while a large file
          is still being read.
        </p>
      </Reveal>

      {/* Deliberately not counted up: these are measured benchmarks, and
          animating one to perform for the reader undercuts the claim. */}
      <Reveal className="mt-12">
        <dl className="grid grid-cols-1 sm:grid-cols-3">
          {NUMBERS.map((item, i) => (
            <div
              key={item.label}
              className={
                "flex min-w-0 flex-col gap-1.5 border-t border-border-soft py-6 " +
                (i > 0 ? "sm:border-l sm:pl-6" : "sm:pr-6")
              }
            >
              <dt className="sr-only">{item.label}</dt>
              <dd className="text-data-xl tabular-nums">{item.value}</dd>
              <p className="text-card-title">{item.label}</p>
              <p className="text-body-sm text-muted-foreground">
                {item.detail}
              </p>
            </div>
          ))}
        </dl>
      </Reveal>

      <ul className="mt-10 grid gap-5 md:grid-cols-3">
        {RUNTIMES.map((runtime) => (
          <li key={runtime.name} className="flex min-w-0 flex-col gap-1">
            <span className="text-body-sm font-medium">{runtime.name}</span>
            <span className="text-body-sm text-muted-foreground">
              {runtime.role}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-caption text-muted-foreground">
        Measured on a 2-core i7-6600U laptop against the development containers
        — the slow case, not a best case. The benchmark scripts and full results
        ship with the source.
      </p>

      <RevealGroup as="dl" className="mt-16 flex flex-col">
        <RevealItem className="border-t border-border-soft pt-6 pb-2">
          <Eyebrow>What it does, and doesn&rsquo;t</Eyebrow>
        </RevealItem>
        {LIMITS.map((limit) => (
          <RevealItem
            key={limit.term}
            className="grid min-w-0 grid-cols-1 gap-x-8 gap-y-1 border-t border-border-soft py-4 sm:grid-cols-[10rem_minmax(0,1fr)]"
          >
            <dt className="text-body-sm font-medium">{limit.term}</dt>
            <dd className="text-body-sm text-muted-foreground">
              {limit.detail}
            </dd>
          </RevealItem>
        ))}
      </RevealGroup>
    </Band>
  )
}
