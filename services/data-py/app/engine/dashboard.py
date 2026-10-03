"""Auto-generated dashboard (PRD F5): charts picked from column profiles.
Port of apps/web/mocks/db/engine/dashboard.ts.
"""

from typing import Any

from app.engine.measures import (
    ColumnInfo,
    columns_of_type,
    default_aggregation,
    flag_columns,
    flag_noun,
    measure_label,
    phrase,
    ranked_measures,
)
from app.engine.time import story_grain
from app.engine.values import js_round

MAX_WIDGETS = 8


def spec(**fields: Any) -> dict[str, Any]:
    """A widget spec without empty fields (JS `undefined` keys are omitted)."""
    return {k: v for k, v in fields.items() if v is not None}


# The leading category's share that makes the best story: one clear winner,
# but a real mix behind it. Below it a column is a flat wall of equal bars,
# far above it a single bar with rounding dust beside it.
IDEAL_TOP_SHARE = 0.6


def bar_score(column: ColumnInfo) -> float:
    """How interesting a categorical column is as a bar chart (PRD F5).

    Port of barScore() in apps/web/mocks/db/engine/dashboard.ts: same terms in
    the same order, rounded the JS way, so both engines sort identically. The
    engine only sees profiles, never rows; `top` holds the 10 most common
    values, so for a wider column the share is measured within those ten.
    """
    top = column.profile.get("categorical", {}).get("top", [])
    covered = sum(t["count"] for t in top)
    if not covered or not top:
        return 0.0

    share = top[0]["count"] / covered
    balance = (
        share / IDEAL_TOP_SHARE
        if share <= IDEAL_TOP_SHARE
        else max(0.0, 1 - (share - IDEAL_TOP_SHARE) / (1 - IDEAL_TOP_SHARE))
    )

    distinct = column.distinct_count
    if 3 <= distinct <= 8:
        readability = 1.0
    elif distinct == 2 or 9 <= distinct <= 12:
        readability = 0.5
    else:
        readability = 0.25

    completeness = max(0.0, min(1.0, 1 - column.profile.get("nullPct", 0)))
    return js_round(0.6 * balance + 0.25 * readability + 0.15 * completeness, 6)


def chartable_categories(columns: list[ColumnInfo]) -> list[ColumnInfo]:
    """Categories worth a bar chart: 2–20 values, preferring 3–8."""
    candidates = [c for c in columns_of_type(columns, "categorical") if 2 <= c.distinct_count <= 20]
    return sorted(candidates, key=lambda c: (0 if 3 <= c.distinct_count <= 8 else 1, c.position))


def auto_widget_specs(columns: list[ColumnInfo], date_column: str | None) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []
    measures = ranked_measures(columns)
    measure = measures[0] if measures else None
    aggregation = default_aggregation(measure.name) if measure else "count"
    metric = measure_label(measure.name if measure else None, aggregation)
    date = next((c for c in columns if c.name == date_column), None) if date_column else None
    span = date.profile.get("datetime") if date else None
    flags = flag_columns(columns)

    if date and span:
        grain = story_grain(span["min"], span["max"], span["grain"])
        specs.append(
            spec(
                chartType="line",
                title=f"{metric} by {grain}",
                x=date.name,
                y=measure.name if measure else None,
                aggregation=aggregation,
                timeGrain=grain,
            )
        )
        if aggregation == "avg":
            specs.append(
                spec(
                    chartType="area",
                    title=f"Rows by {grain}",
                    x=date.name,
                    aggregation="count",
                    timeGrain=grain,
                )
            )
        if flags:
            specs.append(
                spec(
                    chartType="line",
                    title=f"{flag_noun(flags[0].name)} by {grain}",
                    x=date.name,
                    y=flags[0].name,
                    aggregation="sum",
                    timeGrain=grain,
                )
            )

    flag_names = {f.name for f in flags}
    categories = [c for c in chartable_categories(columns) if c.name not in flag_names]
    # Part-to-whole only works for 3–6 segments; pick the donut first so it
    # doesn't duplicate a bar chart.
    donut = next((c for c in categories[2:] if 3 <= c.distinct_count <= 6), None)
    # Which categories get charted stays position-based; which one leads is
    # ranked, because the first bar is also what the Brief narrates (facts.py).
    bars = sorted(
        [c for c in categories if c is not donut][: 3 - (1 if donut else 0)],
        key=lambda c: (-bar_score(c), c.position),
    )
    for category in bars:
        specs.append(
            spec(
                chartType="bar",
                title=f"{metric} by {phrase(category.name)}",
                x=category.name,
                y=measure.name if measure else None,
                aggregation=aggregation,
                limit=8,
            )
        )

    if donut:
        share = aggregation == "sum" and measure is not None
        specs.append(
            spec(
                chartType="donut",
                title=(
                    f"Share of {phrase(measure.name)} by {phrase(donut.name)}"
                    if share and measure
                    else f"Rows by {phrase(donut.name)}"
                ),
                x=donut.name,
                y=measure.name if share and measure else None,
                aggregation="sum" if share else "count",
                limit=6,
            )
        )

    if measure:
        specs.append(
            spec(
                chartType="histogram",
                title=f"Distribution of {phrase(measure.name)}",
                x=measure.name,
                aggregation="count",
            )
        )
    return specs[:MAX_WIDGETS]
