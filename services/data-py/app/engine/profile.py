"""Column profiling (PRD F4). Port of profile.ts profileColumn / inferGrain,
computed on the typed column.
"""

from datetime import UTC, date, datetime
from typing import Any, Literal

import polars as pl

from app.engine.types import ColumnType
from app.engine.values import display_string, iso_string, js_round

TimeGrain = Literal["hour", "day", "week", "month"]
DAY_SECONDS = 86_400


def to_timestamp(iso: str) -> float:
    """Epoch seconds of an ISO date or timestamp (dates are UTC midnight)."""
    if len(iso) == 10:
        return datetime.fromisoformat(iso).replace(tzinfo=UTC).timestamp()
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()


def infer_grain(min_iso: str, max_iso: str, all_month_starts: bool = False) -> TimeGrain:
    # Monthly snapshots (every date on the 1st) read best by month.
    if all_month_starts:
        return "month"
    span = to_timestamp(max_iso) - to_timestamp(min_iso)
    if span <= 3 * DAY_SECONDS:
        return "hour"
    if span <= 120 * DAY_SECONDS:
        return "day"
    if span <= 2 * 366 * DAY_SECONDS:
        return "week"
    return "month"


def _number(value: Any) -> int | float:
    return int(value) if isinstance(value, int) else float(value)


def profile_column(values: pl.Series, column_type: ColumnType) -> dict[str, Any]:
    """Profiles an already-coerced column."""
    n = values.len()
    present = values.drop_nulls()
    as_text = pl.DataFrame({"v": present}).select(display_string(pl.col("v"), present.dtype))
    profile: dict[str, Any] = {
        "nullPct": js_round((n - present.len()) / n, 4) if n else 0,
        "distinctCount": as_text.to_series().n_unique() if present.len() else 0,
    }

    if column_type == "numeric" and present.dtype.is_numeric():
        if present.len():
            floats = present.cast(pl.Float64)
            profile["numeric"] = {
                "min": _number(present.min()),
                "max": _number(present.max()),
                "mean": js_round(float(floats.mean()), 4),  # type: ignore[arg-type]
                "median": js_round(float(floats.quantile(0.5, "linear")), 4),  # type: ignore[arg-type]
                "p95": js_round(float(floats.quantile(0.95, "linear")), 4),  # type: ignore[arg-type]
                "sum": js_round(float(floats.sum()), 2),
            }
    elif column_type == "datetime" and present.dtype in (pl.Date, pl.Datetime("ms", "UTC")):
        if present.len():
            iso = pl.DataFrame({"v": present}).select(iso_string(pl.col("v"), present.dtype))
            texts = iso.to_series()
            lo, hi = str(texts.min()), str(texts.max())
            if present.dtype == pl.Date:
                month_starts = (present.dt.day() == 1).all()
            else:
                month_starts = (
                    (present.dt.day() == 1)
                    & (present.dt.hour() == 0)
                    & (present.dt.minute() == 0)
                    & (present.dt.second() == 0)
                    & (present.dt.millisecond() == 0)
                ).all()
            month_starts = month_starts and present.len() > 1 and lo != hi
            profile["datetime"] = {"min": lo, "max": hi, "grain": infer_grain(lo, hi, month_starts)}
    else:
        counts = (
            as_text.to_series()
            .alias("value")
            .value_counts(name="count")
            .sort(["count", "value"], descending=[True, False])
            .head(10)
        )
        profile["categorical"] = {"top": counts.to_dicts()}
    return profile


def iso_day(value: date | datetime) -> str:
    return value.isoformat()[:10]
