import Link from "next/link"
import { ArrowRightIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"

import { SAMPLES } from "@/features/datasets/samples"

import { Band } from "./band"
import { Reveal } from "./reveal"

export function ClosingCta() {
  return (
    <Band
      tone="ink"
      rhythm="wide"
      width="prose"
      labelledBy="cta-heading"
      innerClassName="flex flex-col items-center gap-8 text-center"
    >
      <Reveal className="flex flex-col items-center gap-4">
        <h2
          id="cta-heading"
          className="font-serif text-display-md text-balance"
        >
          Bring a file and see what it says
        </h2>
        <p className="text-subhead text-pretty text-muted-foreground">
          No file handy? Once you&rsquo;ve signed up, start from one of these
          samples and explore a finished dashboard straight away.
        </p>
      </Reveal>

      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <Button asChild className="h-11 px-6 text-base">
          <Link href="/register">
            Create an account
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-11 px-6 text-base">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>

      {/* Ruled, not three more bordered cards -- the page already has enough
          boxes, and these are a list of names, not objects. */}
      <ul className="mt-2 grid w-full grid-cols-1 text-left sm:grid-cols-3">
        {SAMPLES.map((sample) => (
          <li
            key={sample.key}
            className="flex min-w-0 flex-col gap-1 border-t border-border-soft py-4 sm:pr-6"
          >
            <span className="text-body-sm font-medium">{sample.name}</span>
            <span className="text-body-sm text-muted-foreground">
              {sample.description}
            </span>
          </li>
        ))}
      </ul>
    </Band>
  )
}
