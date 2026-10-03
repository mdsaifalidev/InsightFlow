"""UTC time bucketing shared by widgets, KPIs and the facts engine.
Port of apps/web/mocks/db/engine/time.ts.
"""

import datetime
from typing import Literal

import polars as pl

from app.engine.profile import DAY_SECONDS, to_timestamp

TimeGrain = Literal["hour", "day", "week", "month"]

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS_LONG = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


TRUNCATE = {"hour": "1h", "day": "1d", "week": "1w", "month": "1mo"}
KEY_FORMAT = {"hour": "%Y-%m-%dT%H:00", "day": "%Y-%m-%d", "week": "%Y-%m-%d", "month": "%Y-%m-01"}


def bucket_start_expr(expr: pl.Expr, grain: str) -> pl.Expr:
    """Start of the bucket as a UTC datetime (ISO weeks start on Monday).
    Group on this and format the keys afterwards: formatting every row is slow."""
    return expr.cast(pl.Datetime("ms", "UTC")).dt.truncate(TRUNCATE.get(grain, "1d"))


def format_bucket_expr(expr: pl.Expr, grain: str) -> pl.Expr:
    return expr.dt.strftime(KEY_FORMAT.get(grain, "%Y-%m-%d"))


def bucket_expr(expr: pl.Expr, grain: str) -> pl.Expr:
    """Bucket key of a Date/Datetime column: "2025-04-01", "2025-09-18T14:00"."""
    return format_bucket_expr(bucket_start_expr(expr, grain), grain)


def bucket_key(iso: str, grain: str) -> str:
    """Bucket key of an ISO string or another bucket key (time.ts `bucket`)."""
    if grain == "hour":
        return f"{iso[:13]}:00" if len(iso) > 10 else f"{iso}T00:00"
    if grain == "day":
        return iso[:10]
    if grain == "month":
        return f"{iso[:7]}-01"
    day = datetime.date.fromisoformat(iso[:10])
    return (day - datetime.timedelta(days=day.weekday())).isoformat()


def day_index_expr(expr: pl.Expr) -> pl.Expr:
    """Whole UTC days since the epoch."""
    return expr.cast(pl.Date).cast(pl.Int32)


def day_index(iso: str) -> int:
    return int(to_timestamp(iso[:10]) // DAY_SECONDS)


def period_label(key: str, grain: str) -> str:
    """Human label for a bucket key, used in narratives ("April 2025", "Sep 18")."""
    year, month, day = key[:4], int(key[5:7]), int(key[8:10])
    if grain == "month":
        return f"{MONTHS_LONG[month - 1]} {year}"
    if grain == "week":
        return f"the week of {MONTHS[month - 1]} {day}"
    if grain == "day":
        return f"{MONTHS[month - 1]} {day}"
    return f"{key[11:16]} on {MONTHS[month - 1]} {day}"


def in_period(key: str, grain: str) -> str:
    """Period with its preposition: "in April 2025", "on Sep 18", "at 14:00 on Sep 18"."""
    label = period_label(key, grain)
    if grain in ("month", "week"):
        return f"in {label}"
    if grain == "day":
        return f"on {label}"
    return f"at {label}"


def story_grain(min_iso: str, max_iso: str, profiled: str) -> TimeGrain:
    """Grain for period-over-period storytelling, based on the data's span."""
    if profiled == "month":
        return "month"
    span = to_timestamp(max_iso) - to_timestamp(min_iso)
    if span > 120 * DAY_SECONDS:
        return "month"
    if span > 3 * DAY_SECONDS:
        return "day"
    return "hour"


def anomaly_grain(story: str, min_iso: str, max_iso: str) -> TimeGrain:
    """Finer grain for spotting anomalies within the story grain."""
    if story == "month":
        # Daily detail only when the data really is daily (not monthly snapshots).
        span = to_timestamp(max_iso) - to_timestamp(min_iso)
        return "month" if span > 400 * DAY_SECONDS else "day"
    return "hour"
