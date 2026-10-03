"""Facts engine for the brief (ADR-010): every statistic is computed here, and
the narrative only references facts by id. Port of
apps/web/mocks/db/engine/facts.ts, step for step, on a Polars frame.

`build_facts` returns the facts, anomalies and a template draft; the LLM
layer (app/llm) turns the draft into the final text.
"""

import math
import statistics
from dataclasses import dataclass, field
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
    phrase,
    ranked_measures,
    value_format,
)
from app.engine.query import aggregate, aggregate_expr, finish, is_temporal, number
from app.engine.time import anomaly_grain, bucket_expr, bucket_key, in_period, story_grain
from app.engine.values import display_string, js_round

# Robust z-score threshold for anomalies.
Z_THRESHOLD = 3.5
# An anomaly this strong leads the summary over a modest trend change.
Z_HEADLINE = 6

Json = dict[str, Any]


@dataclass
class Point:
    key: str
    value: int | float
    rows: pl.DataFrame


@dataclass
class Target:
    column: str | None
    aggregation: str
    label: str
    format: str
    widget: Json | None


@dataclass
class Draft:
    """Template text with {{factId}} references, before grounding."""

    lead: list[str] = field(default_factory=list)
    summary: list[str] = field(default_factory=list)
    findings: list[str] = field(default_factory=list)
    questions: list[str] = field(default_factory=list)


@dataclass
class FactSet:
    facts: list[Json]
    anomalies: list[Json]
    draft: Draft


def _sign(value: float) -> int:
    return (value > 0) - (value < 0)


def series_by(
    df: pl.DataFrame, date_column: str, grain: str, column: str | None, aggregation: str
) -> list[Point]:
    frame = df.with_columns(bucket_expr(pl.col(date_column), grain).alias("__key")).filter(
        pl.col("__key").is_not_null()
    )
    parts = frame.partition_by("__key", as_dict=True, include_key=False)
    points = [
        Point(str(key[0]), aggregate(rows, column, aggregation), rows)
        for key, rows in parts.items()
    ]
    return sorted(points, key=lambda p: p.key)


def robust_z(values: list[float]) -> list[float]:
    """Robust z-scores (median / MAD), so a single spike can't hide itself."""
    med = statistics.median(values)
    mad = statistics.median([abs(v - med) for v in values])
    if mad == 0:
        mean = sum(values) / len(values)
        sd = math.sqrt(sum((v - mean) ** 2 for v in values) / len(values)) or 1
        return [(v - mean) / sd for v in values]
    return [(v - med) / (1.4826 * mad) for v in values]


def _per_category(
    df: pl.DataFrame, column: str, measure: str | None, aggregations: tuple[str, str]
) -> dict[str, tuple[int | float, int | float]]:
    """(total, value) per String(category), with the mock's rounding."""
    if df.height == 0:
        return {}
    key = display_string(pl.col(column), df.schema[column]).alias("__key")
    frame = df.with_columns(key).filter(pl.col("__key").is_not_null())
    grouped = frame.group_by("__key", maintain_order=True).agg(
        aggregate_expr(frame, measure, aggregations[0]).alias("__total"),
        aggregate_expr(frame, measure, aggregations[1]).alias("__value"),
    )
    return {
        str(k): (finish(t, aggregations[0]), finish(v, aggregations[1]))
        for k, t, v in grouped.iter_rows()
    }


def find_driver(
    now: pl.DataFrame,
    before: pl.DataFrame,
    column: str,
    measure: str | None,
    aggregation: str,
    sign: int,
) -> Json | None:
    """The category that explains most of a change between two sets of rows,
    measured on the underlying total (so small, noisy groups can't win)."""
    if column not in now.columns:
        return None
    total_agg = "sum" if aggregation == "avg" else aggregation
    total_delta = aggregate(now, measure, total_agg) - aggregate(before, measure, total_agg)
    if not total_delta:
        return None
    in_now = _per_category(now, column, measure, (total_agg, aggregation))
    in_before = _per_category(before, column, measure, (total_agg, aggregation))
    # JS Set order: first appearance across now, then before.
    categories = list(dict.fromkeys([*in_now, *in_before]))
    best: Json | None = None
    for category in categories:
        now_total, now_value = in_now.get(category, (0, 0))
        before_total, before_value = in_before.get(category, (0, 0))
        share = (now_total - before_total) / total_delta
        if not before_value:
            continue
        change = (now_value - before_value) / abs(before_value)
        if _sign(change) != sign:
            continue
        if best is None or share > best["share"]:
            best = {"category": category, "share": share, "change": change}
    return best if best and best["share"] >= 0.3 else None


def _top_driver(
    categories: list[str],
    now: pl.DataFrame,
    before: pl.DataFrame,
    measure: str | None,
    aggregation: str,
    sign: int,
) -> tuple[str, Json] | None:
    drivers = [
        (column, driver)
        for column in categories
        if (driver := find_driver(now, before, column, measure, aggregation, sign))
    ]
    drivers.sort(key=lambda d: d[1]["share"], reverse=True)
    return drivers[0] if drivers else None


def build_facts(
    df: pl.DataFrame,
    columns: list[ColumnInfo],
    date_column: str | None,
    widgets: list[Json],
) -> FactSet:
    facts: list[Json] = []
    anomalies: list[Json] = []
    draft = Draft()

    def add(**fact: Any) -> str:
        fact_id = f"f{len(facts) + 1}"
        if fact.get("ref") is None:
            fact.pop("ref", None)
        facts.append({"id": fact_id, **fact})
        return fact_id

    measures = ranked_measures(columns)
    measure = measures[0].name if measures else None
    aggregation = default_aggregation(measure) if measure else "count"
    label = measure_label(measure, aggregation)
    lower = label[:1].lower() + label[1:]
    fmt = value_format(measure or "", aggregation)
    auto = [w for w in widgets if w["kind"] == "auto"]
    bars = [w for w in auto if w["spec"]["chartType"] == "bar"]
    category_columns = list(
        dict.fromkeys(
            [w["spec"]["x"] for w in bars]
            + [c.name for c in columns_of_type(columns, "categorical")]
        )
    )

    def bar_for(column: str) -> Json | None:
        return next((w for w in bars if w["spec"]["x"] == column), None)

    ids = columns_of_type(columns, "id")
    total_id = add(kind="total", label=label, value=aggregate(df, measure, aggregation), format=fmt)

    date = next((c for c in columns if c.name == date_column), None) if date_column else None
    span = date.profile.get("datetime") if date else None
    if date and span and date.name in df.columns and is_temporal(df.schema[date.name]):
        grain = story_grain(span["min"], span["max"], span["grain"])
        line = next(
            (
                w
                for w in auto
                if w["spec"].get("x") == date.name
                and w["spec"].get("y") == measure
                and w["spec"].get("timeGrain") == grain
            ),
            None,
        )
        series = series_by(df, date.name, grain, measure, aggregation)

        # 1. The most meaningful period-over-period change. A rebound that just
        #    undoes the previous period's move scores lower than the move itself.
        best: tuple[int, float, float] | None = None
        for i in range(1, len(series)):
            prev = series[i - 1].value
            if not prev:
                continue
            change = (series[i].value - prev) / abs(prev)
            two_back = series[i - 2].value if i > 1 else 0
            reverts = bool(two_back) and abs(series[i].value - two_back) / abs(two_back) <= 0.1
            score = abs(change) * (0.5 if reverts else 1) * (1.25 if change < 0 else 1)
            if best is None or score > best[2]:
                best = (i, change, score)

        if best and abs(best[1]) >= 0.05:
            index, change, _ = best
            current, previous = series[index], series[index - 1]
            when = in_period(current.key, grain)
            direction = "fell" if change < 0 else "rose"
            change_id = add(
                kind="change",
                label=f"{label} change {when}",
                value=number(js_round(change, 4)),
                format="change",
                ref={"widgetId": line["id"], "x": current.key} if line else None,
            )
            sentence = f"{label} {direction} {{{{{change_id}}}}} {when}"
            top = _top_driver(
                category_columns, current.rows, previous.rows, measure, aggregation, _sign(change)
            )
            if top:
                column, driver = top
                bar = bar_for(column)
                driver_id = add(
                    kind="contributor",
                    label=f"{driver['category']} {lower} change {when}",
                    value=number(js_round(driver["change"], 4)),
                    format="change",
                    ref={"widgetId": bar["id"], "x": driver["category"]} if bar else None,
                )
                if aggregation == "avg":
                    sentence += (
                        f", led by {driver['category']} ({phrase(column)}),"
                        f" where it moved {{{{{driver_id}}}}}."
                    )
                else:
                    share_id = add(
                        kind="contributor",
                        label=(
                            f"{driver['category']} share of the "
                            f"{'drop' if direction == 'fell' else 'increase'}"
                        ),
                        value=number(js_round(min(driver["share"], 1) * 100, 1)),
                        format="percent",
                    )
                    sentence += (
                        f", driven mostly by {driver['category']} ({phrase(column)}),"
                        f" which moved {{{{{driver_id}}}}} and accounts for"
                        f" {{{{{share_id}}}}} of the change."
                    )
                draft.questions.append(f"What changed for {driver['category']} {when}?")
            else:
                sentence += "."
            draft.summary.append(sentence)
            draft.questions.append(
                f"Is the {'drop' if direction == 'fell' else 'rise'} {when}"
                " a one-off or the start of a trend?"
            )

        # 2. Anomalies on the measure and on tracked flags (churned, errors...).
        targets = [Target(measure, aggregation, label, fmt, line)]
        flags = flag_columns(columns)
        if flags:
            flag = flags[0].name
            noun = flag_noun(flag)
            flag_label = (
                f"{'Churned' if noun == 'Churn' else noun} {entity_label(ids[0].name).lower()}"
                if ids
                else noun
            )
            flag_widget = next((w for w in auto if w["spec"].get("y") == flag), None)
            targets.append(Target(flag, "sum", flag_label, "number", flag_widget))

        fine = anomaly_grain(grain, span["min"], span["max"])
        found: list[tuple[float, Target, Point, Point | None]] = []
        for target in targets:
            points = series_by(df, date.name, fine, target.column, target.aggregation)
            if len(points) < 8:
                continue
            # Averages over a handful of rows (quiet hours) are too noisy to flag.
            min_rows = (
                statistics.median([p.rows.height for p in points]) * 0.8
                if target.aggregation == "avg"
                else 0
            )
            scores = robust_z([float(p.value) for p in points])
            for i, point in enumerate(points):
                if abs(scores[i]) >= Z_THRESHOLD and point.rows.height >= min_rows:
                    found.append((scores[i], target, point, points[i - 1] if i > 0 else None))
        found.sort(key=lambda f: abs(f[0]), reverse=True)

        seen: set[str] = set()
        for z, target, point, previous_point in found:
            # One anomaly per chart point keeps the brief readable.
            widget_grain = (target.widget or {}).get("spec", {}).get("timeGrain") or grain
            chart_x = bucket_key(point.key, widget_grain)
            key = f"{target.label}:{chart_x}"
            if key in seen or len(anomalies) >= 3:
                continue
            seen.add(key)
            when = in_period(point.key, fine)
            high = z > 0
            fact_id = add(
                kind="anomaly",
                label=f"{target.label} {when}",
                value=number(js_round(point.value, 2)),
                format=target.format,
                ref={"widgetId": target.widget["id"], "x": chart_x} if target.widget else None,
            )
            anomalies.append(
                {
                    "id": f"a{len(anomalies) + 1}",
                    "factId": fact_id,
                    "column": target.column or "rows",
                    "at": point.key,
                    "zScore": number(js_round(z, 1)),
                    "direction": "spike" if high else "drop",
                    "description": (
                        f"Unusually {'high' if high else 'low'}"
                        f" {target.label[:1].lower()}{target.label[1:]} {when}."
                    ),
                }
            )
            sentence = (
                f"{target.label} {'spiked' if high else 'dropped'} to {{{{{fact_id}}}}} {when},"
                f" far {'above' if high else 'below'} the usual level"
            )
            if previous_point and abs(z) >= Z_HEADLINE:
                top = _top_driver(
                    category_columns,
                    point.rows,
                    previous_point.rows,
                    target.column,
                    target.aggregation,
                    1 if high else -1,
                )
                if top:
                    column, driver = top
                    bar = bar_for(column)
                    share_id = add(
                        kind="contributor",
                        label=(
                            f"{driver['category']} share of the"
                            f" {'spike' if high else 'drop'} {when}"
                        ),
                        value=number(js_round(min(driver["share"], 1) * 100, 1)),
                        format="percent",
                        ref={"widgetId": bar["id"], "x": driver["category"]} if bar else None,
                    )
                    sentence += (
                        f", with {driver['category']} ({phrase(column)}) accounting for"
                        f" {{{{{share_id}}}}} of the jump"
                    )
                    draft.questions.append(f"What happened to {driver['category']} {when}?")
                draft.lead.append(f"{sentence}.")
            else:
                draft.findings.append(f"{sentence}.")

    # 3. Composition: the largest category's share of the measure.
    first_bar = bars[0] if bars else None
    if first_bar and aggregation == "sum" and measure and measure in df.columns:
        x = first_bar["spec"]["x"]
        total = aggregate(df, measure, "sum")
        if x in df.columns and df.schema[measure].is_numeric():
            frame = df.with_columns(display_string(pl.col(x), df.schema[x]).alias("__key")).filter(
                pl.col("__key").is_not_null() & pl.col(measure).is_not_null()
            )
            sums = (
                frame.group_by("__key", maintain_order=True)
                .agg(pl.col(measure).cast(pl.Float64).sum().alias("__sum"))
                .sort("__sum", descending=True, maintain_order=True)
            )
            if sums.height and total:
                top_category, top_value = sums.row(0)
                share_id = add(
                    kind="total",
                    label=f"{top_category} share of {phrase(measure)}",
                    value=number(js_round(top_value / total * 100, 1)),
                    format="percent",
                    ref={"widgetId": first_bar["id"], "x": top_category},
                )
                draft.findings.append(
                    f"{top_category} is the largest {phrase(x)}, with {{{{{share_id}}}}}"
                    f" of {phrase(measure)}."
                )
                draft.questions.append(f"How has the {phrase(x)} mix shifted over time?")

    draft.summary.append(f"Across the whole dataset, {lower} is {{{{{total_id}}}}}.")
    return FactSet(facts=facts, anomalies=anomalies, draft=draft)
