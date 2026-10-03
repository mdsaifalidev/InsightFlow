"use client"

import * as React from "react"

import { FactMark } from "@/features/insights/components/fact-mark"

// Static example shown beside the auth forms: what InsightFlow produces from an
// orders export. Hovering a number lights up the point it refers to.
const revenue = [412, 428, 451, 368, 440, 463, 471, 489]
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"]
const DIP = 3

const W = 320
const H = 120
const PAD = 12
const min = Math.min(...revenue) - 30
const max = Math.max(...revenue) + 20
const x = (i: number) => PAD + (i * (W - PAD * 2)) / (revenue.length - 1)
const y = (v: number) => H - PAD - ((v - min) / (max - min)) * (H - PAD * 2)
const path = revenue
  .map((v, i) => `${i ? "L" : "M"}${x(i)},${y(revenue[i]!)}`)
  .join(" ")

export function BriefSpecimen() {
  const [active, setActive] = React.useState<"dip" | "volume" | null>(null)

  return (
    <figure className="flex w-full max-w-md flex-col gap-6">
      {/* "Example", not a filename: these numbers are hand-written, so the
          caption must not claim they came from a real file. */}
      <figcaption className="text-sm text-muted-foreground">
        An example brief. Highlighted numbers are computed from the data.
      </figcaption>
      <p className="font-serif text-xl leading-normal text-balance">
        Revenue fell{" "}
        <FactMark
          active={active === "dip"}
          onActiveChange={(on) => setActive(on ? "dip" : null)}
          label="Revenue change in April: minus 18.4 percent"
        >
          −18.4%
        </FactMark>{" "}
        in April, almost entirely from Electronics, while order volume held
        within{" "}
        <FactMark
          active={active === "volume"}
          onActiveChange={(on) => setActive(on ? "volume" : null)}
          label="Order volume change: 2 percent"
        >
          2%
        </FactMark>{" "}
        of March. Customers kept buying, just smaller baskets.
      </p>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="w-full overflow-visible"
        role="img"
        aria-label="Monthly revenue, January to August, with a dip in April"
      >
        <path
          d={path}
          fill="none"
          className="stroke-chart-1"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        {revenue.map((v, i) => (
          <circle
            key={months[i]}
            cx={x(i)}
            cy={y(v)}
            r={i === DIP && active === "dip" ? 6 : 3}
            className={
              i === DIP ? "fill-signal transition-[r]" : "fill-chart-1"
            }
          />
        ))}
        {active === "volume" ? (
          <rect
            x={x(DIP - 1) - 6}
            y={PAD / 2}
            width={x(DIP) - x(DIP - 1) + 12}
            height={H - PAD}
            rx={4}
            className="fill-signal/15"
          />
        ) : null}
        {months.map((m, i) => (
          <text
            key={m}
            x={x(i)}
            y={H + 14}
            textAnchor="middle"
            className="fill-muted-foreground text-[10px]"
          >
            {m}
          </text>
        ))}
      </svg>
    </figure>
  )
}
