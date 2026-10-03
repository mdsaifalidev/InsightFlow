"""Dashboard, KPI and query parity with the TypeScript mock engine. The golden
files hold the TS engine's output on the same sample CSVs (see
apps/web/scripts/export-fixtures.ts).
"""

import json
import math
from functools import cache
from pathlib import Path
from typing import Any

import polars as pl
import pytest

from app.datasets import profile_table
from app.engine.dashboard import auto_widget_specs
from app.engine.kpis import compute_kpis
from app.engine.measures import ColumnInfo
from app.engine.parse import parse_csv
from app.engine.query import apply_filters, rows_json, run_widget, sort_rows

ROOT = Path(__file__).parent.parent
SAMPLES = ("orders", "saas", "weblogs")


@cache
def load(key: str) -> tuple[dict[str, Any], pl.DataFrame, list[ColumnInfo]]:
    golden = json.loads((ROOT / "tests/golden" / f"{key}.json").read_text("utf-8"))
    frame = profile_table(parse_csv(ROOT / "samples" / f"{key}.csv")).frame
    columns = [
        ColumnInfo(c["name"], c["inferredType"], c["position"], c["profile"])
        for c in golden["columns"]
    ]
    return golden, frame, columns


def same(actual: Any, expected: Any, path: str = "$") -> None:
    """Deep equality; numbers may differ in the last float bits."""
    if isinstance(expected, bool) or expected is None or isinstance(expected, str):
        assert actual == expected, path
    elif isinstance(expected, int | float):
        assert isinstance(actual, int | float) and not isinstance(actual, bool), path
        assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-6), (
            f"{path}: {actual} != {expected}"
        )
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(actual) == len(expected), (
            f"{path}: length {len(actual)} != {len(expected)}"
        )
        for i, (a, e) in enumerate(zip(actual, expected, strict=True)):
            same(a, e, f"{path}[{i}]")
    else:
        assert isinstance(actual, dict), path
        assert set(actual) == set(expected), f"{path}: keys {set(actual) ^ set(expected)}"
        for k in expected:
            same(actual[k], expected[k], f"{path}.{k}")


@pytest.mark.parametrize("key", SAMPLES)
def test_auto_dashboard_matches(key: str) -> None:
    golden, _, columns = load(key)
    assert auto_widget_specs(columns, golden["dateColumn"]) == golden["autoSpecs"]


@pytest.mark.parametrize("key", SAMPLES)
def test_kpis_match(key: str) -> None:
    golden, frame, columns = load(key)
    same(compute_kpis(frame, columns, golden["dateColumn"]), golden["kpis"])
    same(
        compute_kpis(frame, columns, golden["dateColumn"], golden["filters"]),
        golden["kpisFiltered"],
    )


@pytest.mark.parametrize("key", SAMPLES)
@pytest.mark.parametrize("filtered", [False, True])
def test_widget_results_match(key: str, filtered: bool) -> None:
    golden, frame, _ = load(key)
    rows = apply_filters(frame, golden["filters"]) if filtered else frame
    expected = golden["resultsFiltered" if filtered else "results"]
    for i, spec in enumerate(golden["specs"]):
        same(run_widget(f"w{i}", rows, spec), expected[i], f"{key}:{spec['title']}")


@pytest.mark.parametrize("key", SAMPLES)
def test_sorted_rows_page_matches(key: str) -> None:
    golden, frame, _ = load(key)
    column, direction = golden["rowsPage"]["sort"].split(":")
    rows = sort_rows(apply_filters(frame, golden["filters"]), column, direction)
    assert rows.height == golden["rowsPage"]["total"]
    same(rows_json(rows.head(25)), golden["rowsPage"]["rows"])
