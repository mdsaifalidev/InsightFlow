"""Column type inference and coercion (PRD F4). Port of profile.ts inferType /
coerce, vectorized: inference reads the raw strings, coercion produces the
typed Polars column stored in Parquet.
"""

import re
from typing import Literal

import polars as pl

from app.engine.values import (
    DATETIME,
    is_day_only,
    stripped,
    to_boolean,
    to_datetime,
    to_number,
)

ColumnType = Literal["numeric", "categorical", "datetime", "boolean", "text", "id"]
COLUMN_TYPES: tuple[ColumnType, ...] = (
    "numeric",
    "categorical",
    "datetime",
    "boolean",
    "text",
    "id",
)

ID_NAME_RE = re.compile(r"(^id$|_id$|^id_|uuid|guid)", re.IGNORECASE)
CODE_NAME_RE = re.compile(r"(status|code|level|rating|tier)", re.IGNORECASE)
ID_VALUE_RE = r"^[A-Za-z]*[-_]?[0-9]+$"


# Cheap prefixes every date / number must start with: an upper bound on the
# share of values that could parse, so the full parse only runs when it can
# change the answer.
DATE_PREFIX = r"^\s*[0-9]{1,4}[-/]"
NUMBER_PREFIX = r"^\s*[-+]?[$€£]?\s?[0-9]"


def infer_type(name: str, raw: pl.Series) -> ColumnType:
    """Infers a column's type from its raw (string) values. Rules run in the
    mock's order and stop at the first match (profile.ts inferType)."""
    raw = raw.cast(pl.String)
    present = raw.filter(raw.str.strip_chars().fill_null("") != "")
    n = present.len()
    if n == 0:
        return "text"
    if ID_NAME_RE.search(name):
        return "id"
    frame = pl.DataFrame({"v": present})

    if frame.select(to_boolean(pl.col("v")).is_not_null().all()).item():
        return "boolean"

    dates = frame.filter(pl.col("v").str.contains(DATE_PREFIX))
    if dates.height >= 0.9 * n:
        parsed = dates.select(to_datetime(pl.col("v")).is_not_null().sum()).item()
        if parsed >= 0.9 * n:
            return "datetime"

    distinct: int = present.n_unique()
    numbers = frame.filter(pl.col("v").str.contains(NUMBER_PREFIX))
    if numbers.height >= 0.95 * n:
        values = numbers.select(to_number(pl.col("v")).alias("n"))["n"]
        if values.is_not_null().sum() >= 0.95 * n:
            # Small sets of integer codes (HTTP status, ratings) read as categories.
            integers = values.len() == n and bool(
                (values.is_not_null() & (values == values.floor())).all()
            )
            if integers and distinct <= 12 and CODE_NAME_RE.search(name):
                return "categorical"
            return "numeric"

    if distinct <= min(200, max(50, n * 0.05)):
        return "categorical"
    if distinct == n and bool(present.str.contains(ID_VALUE_RE).all()):
        return "id"
    return "text"


def coerce(raw: pl.Series, column_type: ColumnType) -> pl.Series:
    """Converts raw strings to the column's type; unparseable values become null."""
    frame = pl.DataFrame({"v": raw.cast(pl.String)})
    name = raw.name
    if column_type == "numeric":
        values = frame.select(to_number(pl.col("v"))).to_series()
        present = values.drop_nulls()
        if present.len() and (present == present.floor()).all() and present.abs().max() < 2**53:  # type: ignore[operator]
            return values.cast(pl.Int64).alias(name)
        return values.alias(name)
    if column_type == "datetime":
        result = frame.select(
            value=to_datetime(pl.col("v")),
            day=is_day_only(pl.col("v")),
        )
        values = result["value"]
        # Pure dates stay dates ("2025-04-01"), like the mock's ISO strings.
        if result.filter(pl.col("value").is_not_null())["day"].all():
            return values.cast(pl.Date).alias(name)
        return values.cast(DATETIME).alias(name)
    if column_type == "boolean":
        return frame.select(to_boolean(pl.col("v"))).to_series().alias(name)
    return frame.select(stripped(pl.col("v"))).to_series().alias(name)
