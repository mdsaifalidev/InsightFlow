import { Band } from "./band"
import { Reveal, RevealGroup, RevealItem } from "./reveal"

// Not a second copy of the brief -- the live one is in the band above, under
// the chart it cites. This band is the argument for why it can be trusted.
//
// It used to make that argument twice: three prose columns, and then a three-
// row pipeline directly beneath them saying the same three things in the same
// order ("the numbers are computed" / "Polars computes the facts", and so on
// down). The columns are gone and their detail folded into the rows here,
// because the pipeline is the better half -- it names what does the work and
// what happens when the check fails, and "validated" on its own is a word any
// product page can print.
const PIPELINE = [
  {
    step: "Polars computes the facts",
    detail:
      "Totals, period-over-period changes, the categories driving them and the outliers — all calculated from your rows before the model is asked for a single word. Seven of them for this file.",
  },
  {
    step: "The model writes around them",
    detail:
      "It receives those facts as structured data and may cite one only as a reference. It never sees a number it could retype and get wrong.",
  },
  {
    step: "Every figure is checked back",
    detail:
      "An ungrounded number fails validation and the attempt is rewritten. A brief that still fails falls back to the computed template, so a figure the model invented cannot reach you.",
  },
]

export function GroundedAi() {
  return (
    <Band
      tone="ink"
      rhythm="wide"
      width="content"
      id="grounded"
      labelledBy="grounded-heading"
    >
      <Reveal fade className="flex max-w-2xl flex-col gap-4">
        <h2
          id="grounded-heading"
          className="font-serif text-display-lg text-balance"
        >
          An AI summary you can actually quote
        </h2>
        <p className="text-subhead text-muted-foreground">
          The reason most AI analytics can&rsquo;t be trusted is that the model
          does the arithmetic. Here it does not — and the numbers it cites are
          links back to the chart they came from.
        </p>
      </Reveal>

      {/* e2e/motion.spec.ts polls the first row's opacity to prove a below-the-
          fold reveal settles. RevealItem carries the opacity itself. */}
      <RevealGroup as="ol" className="mt-12 flex flex-col" step={0.05}>
        {PIPELINE.map((row, i) => (
          <RevealItem
            as="li"
            key={row.step}
            className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-baseline gap-x-5 gap-y-1 border-t border-border-soft py-6 sm:grid-cols-[2.5rem_minmax(0,18rem)_minmax(0,1fr)] sm:gap-x-8"
          >
            <span className="text-body-sm text-signal tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <p className="text-body font-medium">{row.step}</p>
            <p className="col-start-2 text-body-sm text-muted-foreground sm:col-start-3">
              {row.detail}
            </p>
          </RevealItem>
        ))}
      </RevealGroup>
    </Band>
  )
}
