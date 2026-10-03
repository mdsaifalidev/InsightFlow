"""Bar ranking (PRD F5). Mirrors apps/web/mocks/db/engine/dashboard.test.ts:
the golden fixtures can't cover this, because on the sample datasets the score
agrees with the old order — the point is the datasets where it does not.
"""

from typing import Any

from app.engine.dashboard import auto_widget_specs, bar_score
from app.engine.measures import ColumnInfo


def category(name: str, counts: list[int], position: int = 0, null_pct: float = 0.0) -> ColumnInfo:
    return ColumnInfo(
        name=name,
        type="categorical",
        position=position,
        profile={
            "nullPct": null_pct,
            "distinctCount": len(counts),
            "categorical": {"top": [{"value": f"v{i}", "count": c} for i, c in enumerate(counts)]},
        },
    )


MEASURE = ColumnInfo(
    name="revenue",
    type="numeric",
    position=9,
    profile={
        "nullPct": 0,
        "distinctCount": 500,
        "numeric": {"min": 1, "max": 9, "mean": 5, "median": 5, "p95": 9, "sum": 500},
    },
)


def bars_of(columns: list[ColumnInfo]) -> list[Any]:
    return [s["x"] for s in auto_widget_specs(columns, None) if s["chartType"] == "bar"]


def test_prefers_one_clear_leader_over_a_near_constant_column() -> None:
    dominated = category("status", [930, 30, 20, 10, 5, 5])
    leading = category("region", [344, 300, 200, 100, 56])
    assert bar_score(leading) > bar_score(dominated)


def test_prefers_one_clear_leader_over_a_flat_wall_of_equal_bars() -> None:
    uniform = category("uuid_bucket", [100, 100, 100, 100, 100])
    leading = category("region", [344, 300, 200, 100, 56])
    assert bar_score(leading) > bar_score(uniform)


def test_penalises_hard_to_read_and_half_empty_columns() -> None:
    counts = [50, 30, 20]
    readable = category("plan", counts)
    wide = category("city", [*counts, *([1] * 15)])
    sparse = category("plan", counts, null_pct=0.5)
    assert bar_score(readable) > bar_score(wide)
    assert bar_score(readable) > bar_score(sparse)


def test_scores_the_same_numbers_as_the_typescript_engine() -> None:
    """Exact values, so the two engines can't drift apart silently."""
    assert bar_score(category("region", [344, 300, 200, 100, 56])) == 0.744
    assert bar_score(category("status", [930, 30, 20, 10, 5, 5])) == 0.505
    assert bar_score(category("uniform", [100] * 5)) == 0.6


def test_scores_a_column_with_no_profiled_values_at_zero() -> None:
    assert bar_score(category("empty", [])) == 0.0


def test_leads_with_the_best_scoring_bar_not_the_first_column() -> None:
    columns = [
        category("status", [930, 30, 20, 10, 5, 5], position=0),
        category("region", [344, 300, 200, 100, 56], position=1),
        MEASURE,
    ]
    assert bars_of(columns) == ["region", "status"]


def test_keeps_column_order_when_the_scores_tie() -> None:
    counts = [50, 30, 20]
    columns = [
        category("b_first", counts, position=0),
        category("a_second", counts, position=1),
        MEASURE,
    ]
    assert bars_of(columns) == ["b_first", "a_second"]
