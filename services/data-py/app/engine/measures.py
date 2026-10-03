"""Heuristics for which numeric columns matter and how to summarize them.
Port of apps/web/mocks/db/engine/measures.ts.
"""

import re
from dataclasses import dataclass
from typing import Any, Literal

from app.engine.types import ColumnType

Aggregation = Literal["sum", "avg", "count", "min", "max", "count_distinct"]
KpiFormat = Literal["number", "currency", "percent", "duration_ms"]


@dataclass(frozen=True)
class ColumnInfo:
    """What the engine needs to know about a column (effective type applied)."""

    name: str
    type: ColumnType
    position: int
    profile: dict[str, Any]

    @property
    def distinct_count(self) -> int:
        return int(self.profile.get("distinctCount", 0))


PRIORITY = [
    re.compile(p)
    for p in (
        r"revenue|sales|gmv",
        r"mrr|arr|recurring",
        r"amount|total|net|value",
        r"profit|margin",
        r"latency|duration|response_time|_ms$",
        r"price|cost",
        r"seats|quantity|units|qty",
    )
]
AVERAGED = re.compile(r"price|latency|duration|_ms$|rate|pct|percent|ratio|score|age|discount")
FLAG_PRIORITY = re.compile(r"churn|cancel|error|fail|refund|return|bounce")
ACRONYMS = {"mrr", "arr", "gmv", "sku", "url", "id", "ip", "roi", "ltv", "cac"}
AGG_WORDS: dict[str, str] = {
    "sum": "Total",
    "avg": "Average",
    "count": "Count of",
    "count_distinct": "Distinct",
    "min": "Minimum",
    "max": "Maximum",
}


def columns_of_type(columns: list[ColumnInfo], column_type: ColumnType) -> list[ColumnInfo]:
    return [c for c in columns if c.type == column_type]


def ranked_measures(columns: list[ColumnInfo]) -> list[ColumnInfo]:
    """Numeric columns ranked by how likely they are the "main" measure."""

    def rank(name: str) -> int:
        return next((i for i, p in enumerate(PRIORITY) if p.search(name)), len(PRIORITY))

    numeric = [c for c in columns_of_type(columns, "numeric") if c.distinct_count > 1]
    return sorted(numeric, key=lambda c: (rank(c.name), c.position))


def flag_columns(columns: list[ColumnInfo]) -> list[ColumnInfo]:
    """Boolean columns worth tracking over time (churned, is_error, ...)."""
    flags = [c for c in columns_of_type(columns, "boolean") if FLAG_PRIORITY.search(c.name)]
    return sorted(flags, key=lambda c: c.position)


def default_aggregation(name: str) -> Aggregation:
    return "avg" if AVERAGED.search(name) else "sum"


def value_format(name: str, aggregation: str) -> KpiFormat:
    if aggregation in ("count", "count_distinct"):
        return "number"
    if re.search(r"latency|duration|_ms$", name):
        return "duration_ms"
    if re.search(r"pct|percent", name):
        return "percent"
    if re.search(r"revenue|sales|gmv|mrr|arr|amount|price|cost|profit|total", name):
        return "currency"
    return "number"


def _words(name: str) -> list[str]:
    text = name.replace("_", " ")
    text = re.sub(r"\bpct\b", "%", text, count=1)
    text = re.sub(r"\bms\b", "", text, count=1).strip()
    return [w.upper() if w.lower() in ACRONYMS else w.lower() for w in text.split()]


def humanize(name: str) -> str:
    """ "net_revenue" → "Net revenue", "mrr" → "MRR"."""
    text = " ".join(_words(name))
    return text[:1].upper() + text[1:]


def phrase(name: str) -> str:
    """Mid-sentence form: "net revenue", "MRR"."""
    return " ".join(_words(name))


def flag_noun(name: str) -> str:
    """Noun for a boolean flag: "churned" → "Churn", "is_error" → "Error"."""
    known = [
        (r"churn", "Churn"),
        (r"cancel", "Cancellation"),
        (r"error", "Error"),
        (r"fail", "Failure"),
        (r"refund", "Refund"),
        (r"return", "Return"),
        (r"bounce", "Bounce"),
    ]
    for pattern, noun in known:
        if re.search(pattern, name):
            return noun
    return humanize(re.sub(r"^(is|has)_", "", name))


def measure_label(column: str | None, aggregation: str) -> str:
    """ "Total revenue", "Average latency", "Rows"."""
    if not column or aggregation == "count":
        return "Rows"
    return f"{AGG_WORDS[aggregation]} {phrase(column)}"


def entity_label(id_column: str) -> str:
    """ "order_id" → "Orders"."""
    base = re.sub(r"(_id|id_|^id)$", "", id_column, flags=re.IGNORECASE)
    base = base.replace("_", " ").strip() or "record"
    plural = base if base.endswith("s") else f"{base}s"
    return plural[:1].upper() + plural[1:]
