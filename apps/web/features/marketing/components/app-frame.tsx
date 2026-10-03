import * as React from "react"
import Image from "next/image"
import { cn } from "@workspace/ui/lib/utils"

import { TiltStage } from "./tilt-stage"

/**
 * A product screenshot in a window frame. Two captures are shipped per shot
 * (see `pnpm --filter web shots`); CSS picks the one matching the theme, so
 * the image always agrees with the page around it.
 */
export function AppFrame({
  src,
  darkSrc,
  alt,
  priority = false,
  tilt = false,
  fixedAspect = false,
  className,
}: {
  src: string
  darkSrc: string
  alt: string
  priority?: boolean
  /** Follow the pointer in 3D. Hero only: rotation needs a clipping ancestor. */
  tilt?: boolean
  /**
   * Letterbox into a 16:10 stage instead of taking the capture's own ratio.
   * For the tab tour, where four captures of three different shapes share one
   * stage and the page would otherwise jump by a couple of hundred pixels every
   * time the reader switches view. object-contain, not cover: cropping the
   * chart-builder dialog would cut its own buttons off.
   */
  fixedAspect?: boolean
  className?: string
}) {
  // The CSS entrance animates `transform` on the outer element, so the tilt
  // gets its own inner element — a keyframe and an inline transform on one
  // node means the keyframe wins for its whole duration.
  const Stage = tilt ? TiltStage : React.Fragment
  const stageProps = tilt ? { className: "w-full min-w-0" } : {}

  return (
    <div className={cn("w-full min-w-0", className)}>
      <Stage {...stageProps}>
        <div
          className={cn(
            // elev-4 and the strong hairline, because on an ink band a dark
            // screenshot at shadow-primary/5 has almost no separation from the
            // surface behind it and the whole frame reads as a flat panel.
            "w-full min-w-0 overflow-hidden rounded-2xl border border-border-strong bg-card shadow-e4"
          )}
        >
          <div className="flex h-8 items-center gap-1.5 border-b bg-muted/50 px-3">
            {[
              "bg-muted-foreground/20",
              "bg-muted-foreground/20",
              "bg-muted-foreground/20",
            ].map((dot, i) => (
              <span key={i} className={cn("size-2.5 rounded-full", dot)} />
            ))}
          </div>
          <div className={cn(fixedAspect && "aspect-[16/10] bg-card")}>
            <Image
              src={src}
              alt={alt}
              width={1440}
              height={900}
              priority={priority}
              sizes="(max-width: 1152px) 100vw, 1152px"
              className={cn(
                "block w-full dark:hidden",
                fixedAspect && "h-full object-contain object-top"
              )}
            />
            <Image
              src={darkSrc}
              alt=""
              aria-hidden
              width={1440}
              height={900}
              priority={priority}
              sizes="(max-width: 1152px) 100vw, 1152px"
              className={cn(
                "hidden w-full dark:block",
                fixedAspect && "h-full object-contain object-top"
              )}
            />
          </div>
        </div>
      </Stage>
    </div>
  )
}
