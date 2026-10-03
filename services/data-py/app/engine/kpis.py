"""KPI strip (PRD F5): headline numbers with a period-over-period delta.
Port of apps/web/mocks/db/engine/kpis.ts.
"""

from dataclasses import dataclass
from typing import Any

import polars as pl

from app.engine.measures import (
    ColumnInfo,
    columns_of_type,
    default_aggregation,
    entity_label,
    flag_columns,
    flag_noun,
    measure_label,
    ranked_measures,
    value_format,
)
from app.engine.query import Filters, aggregate_expr, apply_filters, finish, number
from app.engine.time import day_index, day_index_expr
from app.engine.values import js_round


@dataclass(frozen=True)
class KpiDef:
    id: str
    label: str
    column: str | None
    aggregation: str
    format: str
    # Boolean share shown as percentage points.
    scale: float = 1


def kpi_defs(columns: list[ColumnInfo]) -> list[KpiDef]:
    ids = columns_of_type(columns, "id")
    defs = [
        KpiDef("entities", entity_label(ids[0].name), ids[0].name, "count_distinct", "number")
        if ids
        else KpiDef("rows", "Rows", None, "count", "number")
    ]
    for measure in ranked_measures(columns)[:2]:
        aggregation = default_aggregation(measure.name)
        defs.append(
            KpiDef(
                f"m:{measure.name}",
                measure_label(measure.name, aggregation),
                measure.name,
                aggregation,
                value_format(measure.name, aggregation),
            )
        )
    flags = flag_columns(columns)
    if flags:
        flag = flags[0]
        defs.append(
            KpiDef(
                f"rate:{flag.name}",
                f"{flag_noun(flag.name)} rate",
                flag.name,
                "avg",
                "percent",
                100,
            )
        )
    return defs[:4]


def _values(df: pl.DataFrame, kpis: list[KpiDef], mask: pl.Expr | None = None) -> list[int | float]:
    """Every KPI's value over the (masked) rows, in one pass."""
    row = df.select(
        [
            aggregate_expr(df, k.column, k.aggregation, mask).alias(f"k{i}")
            for i, k in enumerate(kpis)
        ]
    ).row(0)
    return [
        number(js_round(finish(raw, k.aggregation) * k.scale, 2))
        for raw, k in zip(row, kpis, strict=True)
    ]


def compute_kpis(
    df: pl.DataFrame,
    columns: list[ColumnInfo],
    date_column: str | None,
    filters: Filters | None = None,
) -> list[dict[str, Any]]:
    filters = filters or {}
    where_only = apply_filters(df, {"where": filters.get("where")})
    selected = apply_filters(where_only, {"dateRange": filters.get("dateRange")})
    kpis = kpi_defs(columns)

    # Comparison windows on the date column.
    windows: tuple[tuple[int, int], tuple[int, int], str] | None = None
    if date_column and date_column in df.columns:
        date_range = filters.get("dateRange") or {}
        if date_range.get("from") and date_range.get("to"):
            start, end = day_index(date_range["from"]), day_index(date_range["to"])
            length = end - start + 1
            windows = ((start, end), (start - length, start - 1), f"vs previous {length} days")
        elif selected.height:
            low, high = selected.select(
                day_index_expr(pl.col(date_column)).min().alias("low"),
                day_index_expr(pl.col(date_column)).max().alias("high"),
            ).row(0)
            if low is not None and high is not None:
                width = min(30, (high - low + 1) // 2)
                if width >= 1:
                    windows = (
                        (high - width + 1, high),
                        (high - 2 * width + 1, high - width),
                        f"Last {width} days vs prior {width}",
                    )

    values = _values(selected, kpis)
    deltas: list[float | None] = [None] * len(kpis)
    if windows and date_column:
        day = day_index_expr(pl.col(date_column))
        current = _values(where_only, kpis, day.is_between(*windows[0]).fill_null(False))
        previous = _values(where_only, kpis, day.is_between(*windows[1]).fill_null(False))
        deltas = [
            js_round((cur - prev) / abs(prev), 4) if prev else None
            for cur, prev in zip(current, previous, strict=True)
        ]

    return [
        {
            "id": kpi.id,
            "label": kpi.label,
            "column": kpi.column,
            "aggregation": kpi.aggregation,
            "value": value,
            "delta": number(delta) if delta is not None else None,
            "deltaLabel": windows[2] if windows and delta is not None else None,
            "format": kpi.format,
        }
        for kpi, value, delta in zip(kpis, values, deltas, strict=True)
    ]
