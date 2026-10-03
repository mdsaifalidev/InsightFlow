import { ImageResponse } from "next/og"

// Satori renders a CSS subset: inline styles only (no Tailwind), and every
// element with more than one child needs an explicit display.
export const alt =
  "InsightFlow — a dashboard and a written brief from your spreadsheet"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// The brand tokens, as literals: packages/ui/src/styles/globals.css (.dark).
const INK = "#111318"
const PAPER = "#e6e8ec"
const PRUSSIAN = "#8ea2ff"
const AMBER = "#e8b23a"
const MUTED = "#9aa1ad"

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: INK,
        color: PAPER,
        padding: 80,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div
          style={{
            display: "flex",
            width: 56,
            height: 56,
            borderRadius: 14,
            background: PRUSSIAN,
          }}
        />
        <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.5 }}>
          InsightFlow
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div
          style={{
            fontSize: 68,
            fontWeight: 600,
            letterSpacing: -2,
            lineHeight: 1.1,
            maxWidth: 900,
          }}
        >
          Turn a spreadsheet into a dashboard and a written brief
        </div>
        <div style={{ fontSize: 30, color: MUTED, maxWidth: 820 }}>
          Every number in the brief is computed from your data — never written
          by the model.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            display: "flex",
            width: 14,
            height: 14,
            borderRadius: 7,
            background: AMBER,
          }}
        />
        <div style={{ fontSize: 24, color: MUTED }}>
          CSV or Excel · dashboard in seconds · no setup
        </div>
      </div>
    </div>,
    size
  )
}
