"use client"

import * as React from "react"

/** A point on a chart that a Brief number refers to. */
export type Highlight = { widgetId: string; x: string | number } | null

const HighlightContext = React.createContext<{
  highlight: Highlight
  setHighlight: (highlight: Highlight) => void
}>({ highlight: null, setHighlight: () => {} })

export function HighlightProvider({ children }: { children: React.ReactNode }) {
  const [highlight, setHighlight] = React.useState<Highlight>(null)
  const value = React.useMemo(() => ({ highlight, setHighlight }), [highlight])
  return (
    <HighlightContext.Provider value={value}>
      {children}
    </HighlightContext.Provider>
  )
}

export function useHighlight() {
  return React.useContext(HighlightContext)
}

/** The highlighted x for one widget, or null. */
export function useWidgetHighlight(widgetId: string) {
  const { highlight } = useHighlight()
  return highlight?.widgetId === widgetId ? highlight.x : null
}
