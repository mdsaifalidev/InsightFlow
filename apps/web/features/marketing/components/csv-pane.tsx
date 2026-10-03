import raw from "../showcase-raw.json"

/**
 * The "before": the literal head of services/data-py/samples/orders.csv.
 *
 * Deliberately not prettified, and deliberately not a shadcn Table. Its
 * plainness is the entire argument of the section it sits in — a styled,
 * zebra-striped, nicely-spaced rendering of a CSV would quietly concede that
 * raw rows are readable, which is the thing the product exists to deny.
 *
 * A server component: showcase-raw.json is separate from showcase-data.json so
 * these rows are never bundled for the browser.
 */

/** The column the headline number in the next pane is computed from. */
const TRACED = "revenue"

const rows = raw.rows as Record<string, string | number>[]

function kb(bytes: number) {
  return `${Math.round(bytes / 1024).toLocaleString("en-US")} KB`
}

export function CsvPane() {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-wrap items-baseline gap-x-2 text-caption text-muted-foreground">
        <span className="font-medium text-foreground">{raw.fileName}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{kb(raw.bytes)}</span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">
          {raw.rowCount.toLocaleString("en-US")} rows
        </span>
        <span aria-hidden>·</span>
        <span className="tabular-nums">{raw.columns.length} columns</span>
      </figcaption>

      {/* Scrolls inside its own box, and the right edge is masked rather than
          cut. Ten columns of monospace need about 1040px and the pane gets
          under half that, which is not a layout bug -- it is the argument. The
          alternative, shrinking the type until all ten fit, would make the file
          look tidier than it is. */}
      <div className="min-w-0 overflow-x-auto rounded-2xl border border-border-soft bg-card/40 [mask-image:linear-gradient(to_right,#000_0,#000_calc(100%-3rem),transparent_100%)]">
        <table className="w-full border-collapse text-left font-mono text-mono-sm whitespace-nowrap">
          <caption className="sr-only">
            The first {rows.length} rows of {raw.fileName}, exactly as the file
            stores them.
          </caption>
          <thead>
            <tr>
              {raw.columns.map((column) => (
                <th
                  key={column}
                  scope="col"
                  className={
                    "border-b border-border-soft px-3 py-2 font-normal text-muted-foreground " +
                    (column === TRACED
                      ? "border-l-2 border-l-signal bg-signal/[0.07] text-signal"
                      : "")
                  }
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {raw.columns.map((column) => (
                  <td
                    key={column}
                    className={
                      "border-b border-border-soft/60 px-3 py-1.5 text-muted-foreground " +
                      (column === TRACED
                        ? "border-l-2 border-l-signal bg-signal/[0.07] text-foreground"
                        : "")
                    }
                  >
                    {String(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-caption text-muted-foreground">
        …and {(raw.rowCount - rows.length).toLocaleString("en-US")} more rows.{" "}
        {/* Names the transformation. The amber revenue column is off the right
            edge of the pane at rest -- ten columns never fit beside a dashboard
            -- so the gesture has to be carried in words as well as colour. */}
        <span className="text-foreground">
          <span className="text-signal">{TRACED}</span> by{" "}
          <span className="text-signal">order_date</span> became the chart.
        </span>
      </p>
    </figure>
  )
}
