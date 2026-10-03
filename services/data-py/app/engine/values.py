"""Vectorized value recognizers shared by type inference, coercion and output.
Port of apps/web/mocks/db/engine/values.ts; patterns match it character for
character, with ASCII digits ([0-9]) where JS `\\d` is ASCII-only.
"""

import math

import polars as pl

NUMBER_RE = r"^[-+]?[$€£]?\s?([0-9]{1,3}(,[0-9]{3})+|[0-9]+)(\.[0-9]+)?%?$"
ISO_DAY_RE = r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"
ISO_TIMESTAMP_RE = (
    r"^([0-9]{4}-[0-9]{2}-[0-9]{2})[T ]([0-9]{2}:[0-9]{2})(:[0-9]{2})?(\.[0-9]+)?"
    r"(Z|[+-][0-9]{2}:?[0-9]{2})?$"
)
US_DATE_RE = r"^([0-9]{1,2})/([0-9]{1,2})/([0-9]{4})$"
BOOL_VALUES = {"true": True, "false": False, "yes": True, "no": False}

DATETIME = pl.Datetime("ms", "UTC")


def js_round(value: float, digits: int = 0) -> float:
    """Math.round(value * 10^d) / 10^d, i.e. halves round up (not to even)."""
    factor = 10**digits
    return float(math.floor(value * factor + 0.5) / factor)


def js_round_expr(expr: pl.Expr, digits: int) -> pl.Expr:
    factor = 10**digits
    rounded: pl.Expr = (expr * factor + 0.5).floor() / factor
    return rounded


def stripped(s: pl.Expr) -> pl.Expr:
    """Trimmed text, with blanks as null."""
    text = s.cast(pl.String).str.strip_chars()
    return pl.when(text == "").then(None).otherwise(text)


def to_number(s: pl.Expr) -> pl.Expr:
    text = s.cast(pl.String).str.strip_chars()
    return (
        pl.when(text.str.contains(NUMBER_RE))
        .then(text.str.replace_all(r"[$€£,%\s+]", "").cast(pl.Float64, strict=False))
        .otherwise(None)
    )


def to_boolean(s: pl.Expr) -> pl.Expr:
    return (
        s.cast(pl.String)
        .str.strip_chars()
        .str.to_lowercase()
        .replace_strict(BOOL_VALUES, default=None, return_dtype=pl.Boolean)
    )


def is_day_only(s: pl.Expr) -> pl.Expr:
    """Values that are plain dates (no time part): "2025-04-01", "4/1/2025"."""
    text = s.cast(pl.String).str.strip_chars()
    return text.str.contains(ISO_DAY_RE) | text.str.contains(US_DATE_RE)


def to_datetime(s: pl.Expr) -> pl.Expr:
    """ISO dates/timestamps and US M/D/YYYY dates as UTC datetimes (ms).
    Timestamps without an offset are read as UTC."""
    text = s.cast(pl.String).str.strip_chars()
    day = text.str.to_date("%Y-%m-%d", strict=False)

    parts = text.str.extract_groups(ISO_TIMESTAMP_RE)
    offset = (
        parts.struct.field("5")
        .fill_null("Z")
        .replace({"Z": "+00:00"})
        .str.replace(r"^([+-][0-9]{2})([0-9]{2})$", "${1}:${2}")
    )
    canonical = pl.concat_str(
        [
            parts.struct.field("1"),
            pl.lit("T"),
            parts.struct.field("2"),
            parts.struct.field("3").fill_null(":00"),
            parts.struct.field("4").fill_null(".0"),
            offset,
        ]
    )
    timestamp = canonical.str.to_datetime(
        "%Y-%m-%dT%H:%M:%S%.f%:z", strict=False, time_unit="ms"
    ).dt.convert_time_zone("UTC")

    us = text.str.extract_groups(US_DATE_RE)
    us_day = pl.concat_str(
        [
            us.struct.field("3"),
            us.struct.field("1").str.zfill(2),
            us.struct.field("2").str.zfill(2),
        ],
        separator="-",
    ).str.to_date("%Y-%m-%d", strict=False)

    return (
        pl.when(text.str.contains(ISO_DAY_RE))
        .then(day.cast(DATETIME))
        .when(text.str.contains(ISO_TIMESTAMP_RE))
        .then(timestamp)
        .when(text.str.contains(US_DATE_RE))
        .then(us_day.cast(DATETIME))
        .otherwise(None)
    )


def iso_string(expr: pl.Expr, dtype: pl.DataType) -> pl.Expr:
    """ISO text like the mock's JS values: "2025-04-01" for dates,
    "2025-09-18T16:05:43.000Z" for timestamps."""
    if dtype == pl.Date:
        return expr.dt.strftime("%Y-%m-%d")
    return expr.dt.strftime("%Y-%m-%dT%H:%M:%S%.3fZ")


def display_string(expr: pl.Expr, dtype: pl.DataType) -> pl.Expr:
    """String(value) in JS: ISO for dates, "true"/"false", numbers as written."""
    if dtype in (pl.Date, pl.Datetime) or isinstance(dtype, pl.Datetime):
        return iso_string(expr, dtype)
    if dtype == pl.Boolean:
        return pl.when(expr).then(pl.lit("true")).otherwise(pl.lit("false"))
    if dtype == pl.Float64:
        # JS prints integral floats without ".0".
        return (
            pl.when(expr == expr.round(0))
            .then(expr.cast(pl.Int64, strict=False).cast(pl.String))
            .otherwise(expr.cast(pl.String))
        )
    return expr.cast(pl.String)
