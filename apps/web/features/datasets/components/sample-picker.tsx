"use client"

import { ChevronDownIcon, FlaskConicalIcon } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { SampleKey } from "@/lib/api/types"
import { SAMPLES } from "../samples"

export function SampleMenu({
  onPick,
  disabled,
}: {
  onPick: (key: SampleKey) => void
  disabled?: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          <FlaskConicalIcon data-icon="inline-start" />
          Try a sample
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>Sample datasets</DropdownMenuLabel>
        <DropdownMenuGroup>
          {SAMPLES.map((sample) => (
            <DropdownMenuItem
              key={sample.key}
              onSelect={() => onPick(sample.key)}
              className="flex-col items-start gap-0.5"
            >
              <span className="font-medium">{sample.name}</span>
              <span className="text-xs text-muted-foreground">
                {sample.description}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
