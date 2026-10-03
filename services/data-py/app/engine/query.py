"""Filtering, sorting and widget aggregation over a typed Polars frame.
Port of apps/web/mocks/db/engine/query.ts (ARCHITECTURE §3.3).

JS semantics that matter for identical results:
- groups keep first-appearance order (JS Map), and rank sorts are stable;
- `count` counts rows (nulls included); other aggregations only see numbers,
  booleans count as 1/0, and an empty set gives 0;
- sums round to 2 places and averages to 4, halves up (Math.round).
"""

import datetime
import math
from typing import Any

import polars as pl

from app.engine.measures import value_format
from app.engine.time import bucket_start_expr, format_bucket_expr
from app.engine.values import display_string, iso_string, js_round

OTHER = "Other"
SINGLE_SERIES = "value"
Spec = dict[str, Any]
Filters = dict[str, Any]


def is_temporal(dtype: pl.DataType) -> bool:
    return dtype == pl.Date or isinstance(dtype, pl.Datetime)


def is_numeric(dtype: pl.DataType) -> bool:
    return dtype.is_numeric() or dtype == pl.Boolean


def number(value: Any) -> int | float:
    """JSON-friendly number: integral floats print like JS (3, not 3.0)."""
    if value is None:
        return 0
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, float) and value.is_integer() and abs(value) < 2**53:
        return int(value)
    return value  # type: ignore[no-any-return]


# ---------- Filters ----------


def _date_bound(value: str) -> datetime.date | None:
    try:
        return datetime.date.fromisoformat(value[:10])
    except ValueError:
        return None


def _compare_day(day: pl.Expr, bound: str, op: str) -> pl.Expr:
    """Inclusive bound on the date part, like the mock's string comparison."""
    parsed = _date_bound(bound)
    left: pl.Expr = day if parsed else day.dt.strftime("%Y-%m-%d")
    right: pl.Expr = pl.lit(parsed) if parsed else pl.lit(bound)
    return left >= right if op == ">=" else left <= right


def apply_filters(df: pl.DataFrame, filters: Filters | None) -> pl.DataFrame:
    if not filters:
        return df
    conditions: list[pl.Expr] = []
    date_range = filters.get("dateRange") or {}
    column = date_range.get("column")
    start, end = date_range.get("from"), date_range.get("to")
    if column and (start or end) and column in df.columns:
        values = pl.col(column)
        if is_temporal(df.schema[column]):
            dtype = df.schema[column]
            day = values if dtype == pl.Date else values.cast(pl.Datetime("ms", "UTC")).dt.date()
            conditions.append(day.is_not_null())
            if start:
                conditions.append(_compare_day(day, start, ">="))
            if end:
                conditions.append(_compare_day(day, end, "<="))
        else:
            # Only dates survive a date range (JS: typeof value === "string").
            conditions.append(pl.lit(False))
    for where in filters.get("where") or []:
        wanted = [str(v) for v in where.get("values") or []]
        name = where.get("column")
        if not wanted or name not in df.columns:
            continue
        conditions.append(display_string(pl.col(name), df.schema[name]).is_in(wanted))
    return df.filter(pl.all_horizontal(conditions)) if conditions else df


def sort_rows(df: pl.DataFrame, column: str, direction: str) -> pl.DataFrame:
    """Nulls stay last in both directions; ties keep their order."""
    return df.sort(column, descending=direction == "desc", nulls_last=True, maintain_order=True)


# ---------- Aggregation ----------


def aggregate_expr(
    df: pl.DataFrame, column: str | None, aggregation: str, mask: pl.Expr | None = None
) -> pl.Expr:
    """An expression for one aggregate, before rounding; `mask` restricts it to
    some rows, so several windows can be aggregated in one pass."""
    if aggregation == "count" or not column or column not in df.columns:
        return (pl.len() if mask is None else mask.sum()).cast(pl.Float64)
    values = pl.col(column) if mask is None else pl.col(column).filter(mask)
    if aggregation == "count_distinct":
        return values.drop_nulls().n_unique().cast(pl.Float64)
    if not is_numeric(df.schema[column]):
        return pl.lit(0.0)
    numbers = values.cast(pl.Float64)
    if aggregation == "sum":
        return numbers.sum()
    if aggregation == "avg":
        return numbers.mean().fill_null(0.0)
    if aggregation == "min":
        return numbers.min().fill_null(0.0)
    return numbers.max().fill_null(0.0)


def finish(value: float | None, aggregation: str) -> int | float:
    value = 0.0 if value is None or (isinstance(value, float) and math.isnan(value)) else value
    if aggregation == "sum":
        value = js_round(value, 2)
    elif aggregation == "avg":
        value = js_round(value, 4)
    return number(value)


def aggregate(df: pl.DataFrame, column: str | None, aggregation: str) -> int | float:
    if aggregation == "count" or not column:
        return df.height
    raw = df.select(aggregate_expr(df, column, aggregation)).item()
    return finish(raw, aggregation)


def category_key(df: pl.DataFrame, column: str) -> pl.Expr:
    """Group key for a category: booleans read Yes/No; nulls are dropped."""
    dtype = df.schema[column]
    if dtype == pl.Boolean:
        return pl.when(pl.col(column)).then(pl.lit("Yes")).otherwise(pl.lit("No"))
    return display_string(pl.col(column), dtype)


def _grouped(
    df: pl.DataFrame, key: pl.Expr, column: str | None, aggregation: str
) -> list[tuple[str, int | float, int]]:
    """(key, aggregate, rows) per non-null key, in first-appearance order."""
    frame = df.with_columns(key.alias("__key")).filter(pl.col("__key").is_not_null())
    grouped = frame.group_by("__key", maintain_order=True).agg(
        aggregate_expr(frame, column, aggregation).alias("__value"),
        pl.len().alias("__rows"),
    )
    return [
        (str(k), finish(v, aggregation), int(n))
        for k, v, n in grouped.select("__key", "__value", "__rows").iter_rows()
    ]


def _top_names(groups: list[tuple[str, int | float, int]], limit: int, by_rows: bool) -> list[str]:
    """Top `limit` group names (stable ranking); the rest become "Other"."""
    ranked = sorted(groups, key=lambda g: g[2] if by_rows else g[1], reverse=True)
    names = [g[0] for g in ranked]
    return names if len(names) <= limit else [*names[: limit - 1], OTHER]


def _label(key: pl.Expr, kept: list[str]) -> pl.Expr:
    """Maps a key to itself when kept, else to "Other" (nulls stay null)."""
    return (
        pl.when(key.is_null()).then(None).when(key.is_in(kept)).then(key).otherwise(pl.lit(OTHER))
    )


# ---------- Widgets ----------


def _split_labels(df: pl.DataFrame, spec: Spec, limit: int) -> tuple[list[str], pl.Expr | None]:
    split = spec.get("split")
    if not split or split not in df.columns:
        return [SINGLE_SERIES], None
    key = category_key(df, split)
    names = _top_names(_grouped(df, key, spec.get("y"), spec["aggregation"]), limit, False)
    kept = [n for n in names if n != OTHER]
    return names, _label(key, kept)


def time_series(df: pl.DataFrame, spec: Spec) -> tuple[list[str], list[dict[str, Any]]]:
    grain = spec.get("timeGrain") or "day"
    x, y, aggregation = spec["x"], spec.get("y"), spec["aggregation"]
    names, split_label = _split_labels(df, spec, 5)
    if x not in df.columns or not is_temporal(df.schema[x]):
        return ([] if spec.get("split") else [SINGLE_SERIES]), []

    frame = df.with_columns(
        bucket_start_expr(pl.col(x), grain).alias("__start"),
        (split_label if split_label is not None else pl.lit(SINGLE_SERIES)).alias("__series"),
    ).filter(pl.col("__start").is_not_null() & pl.col("__series").is_not_null())
    grouped = (
        frame.group_by(["__series", "__start"])
        .agg(aggregate_expr(frame, y, aggregation).alias("__value"))
        .select("__series", format_bucket_expr(pl.col("__start"), grain), "__value")
    )
    values: dict[str, dict[str, int | float]] = {}
    for series, bucket, value in grouped.iter_rows():
        values.setdefault(bucket, {})[series] = finish(value, aggregation)

    zero_fill = aggregation in ("sum", "count")
    points: list[dict[str, Any]] = []
    series_order: list[str] = []
    for bucket in sorted(values):
        present = [n for n in names if n in values[bucket]]
        keys = present + ([n for n in names if n not in values[bucket]] if zero_fill else [])
        point: dict[str, Any] = {"x": bucket}
        for name in keys:
            point[name] = values[bucket].get(name, 0)
            if name not in series_order:
                series_order.append(name)
        points.append(point)
    return (series_order if spec.get("split") else [SINGLE_SERIES]), points


def category_series(df: pl.DataFrame, spec: Spec) -> tuple[list[str], list[dict[str, Any]]]:
    limit = spec.get("limit") or (6 if spec["chartType"] == "donut" else 8)
    x, y, aggregation = spec["x"], spec.get("y"), spec["aggregation"]
    if x not in df.columns:
        return [SINGLE_SERIES], []
    key = category_key(df, x)
    categories = _top_names(_grouped(df, key, y, aggregation), limit, False)
    kept = [c for c in categories if c != OTHER]

    split = spec.get("split")
    if split and split in df.columns:
        split_key = category_key(df, split)
        names = _top_names(_grouped(df, split_key, None, "count"), 5, True)
        split_label = _label(split_key, [n for n in names if n != OTHER])
    else:
        names, split_label = [SINGLE_SERIES], pl.lit(SINGLE_SERIES)

    frame = df.with_columns(
        _label(key, kept).alias("__category"), split_label.alias("__series")
    ).filter(pl.col("__category").is_not_null())
    grouped = (
        frame.filter(pl.col("__series").is_not_null())
        .group_by(["__category", "__series"], maintain_order=True)
        .agg(aggregate_expr(frame, y, aggregation).alias("__value"))
    )
    values = {(c, s): finish(v, aggregation) for c, s, v in grouped.iter_rows()}

    points = []
    for category in categories:
        point: dict[str, Any] = {"x": category}
        for name in names:
            point[name] = values.get((category, name), 0)
        points.append(point)
    return names, points


def histogram(df: pl.DataFrame, column: str) -> list[dict[str, Any]]:
    if column not in df.columns or not df.schema[column].is_numeric():
        return []
    values = df.get_column(column).drop_nulls().cast(pl.Float64)
    if values.len() == 0:
        return []
    low, high = float(values.min()), float(values.max())  # type: ignore[arg-type]
    integers = bool((values == values.floor()).all())
    narrow = integers and high - low < 20
    bins = max(1, int(high - low + 1)) if narrow else 20
    width = 1.0 if narrow else (high - low or 1) / bins
    index = ((values - low) / width).floor().clip(upper_bound=bins - 1).cast(pl.Int64)
    counts = index.value_counts().to_dict(as_series=False)
    by_bin = dict(zip(counts[index.name], counts["count"], strict=True))
    return [
        {
            "x": number(js_round(low + i * width, 2)),
            "x2": number(js_round(low + (i + 1) * width, 2)),
            SINGLE_SERIES: by_bin.get(i, 0),
        }
        for i in range(bins)
    ]


def run_widget(widget_id: str, df: pl.DataFrame, spec: Spec) -> dict[str, Any]:
    chart = spec["chartType"]
    fmt = value_format(spec.get("y") or "", spec["aggregation"])
    if chart in ("line", "area"):
        series, points = time_series(df, spec)
        return {"widgetId": widget_id, "series": series, "points": points, "format": fmt}
    if chart in ("bar", "donut"):
        series, points = category_series(df, spec)
        return {"widgetId": widget_id, "series": series, "points": points, "format": fmt}
    return {
        "widgetId": widget_id,
        "series": [SINGLE_SERIES],
        "points": histogram(df, spec["x"]),
        "format": "number",
        "xFormat": value_format(spec["x"], "sum"),
    }


def rows_json(df: pl.DataFrame) -> list[dict[str, Any]]:
    """Rows as JSON values: dates as ISO strings, like the mock's typed rows."""
    temporal = [
        iso_string(pl.col(name), dtype).alias(name)
        for name, dtype in df.schema.items()
        if is_temporal(dtype)
    ]
    return (df.with_columns(temporal) if temporal else df).to_dicts()
