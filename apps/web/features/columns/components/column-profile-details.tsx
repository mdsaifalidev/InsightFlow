import type { ColumnType, DatasetColumn } from "@/lib/api/types"
import { formatDate, formatNumber, formatPercent } from "@/lib/format"
import { COLUMN_TYPES } from "@/features/datasets/constants"

/** Full profile shown in the column hover card. */
export function ColumnProfileDetails({
  column,
  type,
}: {
  column: DatasetColumn
  type: ColumnType
}) {
  const { numeric, datetime, categorical, nullPct, distinctCount } =
    column.profile
  const maxCount = categorical?.top[0]?.count ?? 1

  const stats: [string, string][] = numeric
    ? [
        ["Min", formatNumber(numeric.min)],
        ["Max", formatNumber(numeric.max)],
        ["Mean", formatNumber(numeric.mean)],
        ["Median", formatNumber(numeric.median)],
        ["95th percentile", formatNumber(numeric.p95)],
        ["Sum", formatNumber(numeric.sum, { compact: true })],
      ]
    : datetime
      ? [
          ["Earliest", formatDate(datetime.min)],
          ["Latest", formatDate(datetime.max)],
          ["Grain", datetime.grain],
        ]
      : []

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{column.name}</span>
        <span className="text-xs text-muted-foreground">
          {COLUMN_TYPES[type].label}, {formatNumber(distinctCount)} distinct,{" "}
          {formatPercent(nullPct)} missing
        </span>
      </div>

      {stats.length ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          {stats.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {categorical?.top.length ? (
        <ul className="flex flex-col gap-1.5" aria-label="Most common values">
          {categorical.top.map((item) => (
            <li key={item.value} className="flex flex-col gap-0.5 text-sm">
              <div className="flex justify-between gap-3">
                <span className="truncate">{item.value}</span>
                <span className="text-muted-foreground tabular-nums">
                  {formatNumber(item.count)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted" aria-hidden>
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${(item.count / maxCount) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
