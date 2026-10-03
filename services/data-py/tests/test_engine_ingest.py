"""Parsing, type inference and profiling. Golden files come from the TypeScript
mock engine (apps/web/scripts/export-fixtures.ts), so both engines agree.
"""

import datetime
import json
from pathlib import Path
from typing import Any

import polars as pl
import pytest
import xlsxwriter

from app.datasets import profile_table
from app.engine.parse import ParseError, normalize_column_names, parse_csv, parse_xlsx
from app.engine.types import coerce, infer_type

ROOT = Path(__file__).parent.parent
SAMPLES = ("orders", "saas", "weblogs")


def golden(key: str) -> dict[str, Any]:
    return json.loads((ROOT / "tests/golden" / f"{key}.json").read_text("utf-8"))


def write(tmp_path: Path, text: str, name: str = "data.csv") -> Path:
    path = tmp_path / name
    path.write_bytes(text.encode("utf-8"))
    return path


@pytest.mark.parametrize("key", SAMPLES)
def test_sample_profiles_match_the_typescript_engine(key: str) -> None:
    expected = golden(key)
    profiled = profile_table(parse_csv(ROOT / "samples" / f"{key}.csv"))
    assert profiled.frame.height == expected["rowCount"]
    actual = [
        {
            "name": c["name"],
            "originalName": c["original_name"],
            "position": c["position"],
            "inferredType": c["inferred_type"],
            "overrideType": None,
            "profile": c["profile"],
        }
        for c in profiled.columns
    ]
    assert actual == expected["columns"]


def test_normalizes_column_names() -> None:
    names = [
        c.name
        for c in normalize_column_names(
            ["Order ID", "Net Revenue ($)", "", "2024", "Order ID", "Café-Name"]
        )
    ]
    assert names == ["order_id", "net_revenue", "column_3", "c_2024", "order_id_2", "cafe_name"]


def test_reports_rows_with_extra_columns(tmp_path: Path) -> None:
    body = "a,b\n" + "1,2\n" * 1300 + "1,2,3\n"
    with pytest.raises(ParseError, match=r"^Row 1,302 has 3 columns, expected 2\.$"):
        parse_csv(write(tmp_path, body))


def test_reports_unclosed_quotes(tmp_path: Path) -> None:
    with pytest.raises(ParseError, match="unclosed quote"):
        parse_csv(write(tmp_path, 'a,b\n1,"2\n3,4\n'))


@pytest.mark.parametrize(
    ("text", "message"),
    [
        ("", "no header row"),
        (",,\n1,2,3\n", "no header row"),
        ("a,b\n\n,\n", "header row but no data rows"),
    ],
)
def test_rejects_files_without_header_or_rows(tmp_path: Path, text: str, message: str) -> None:
    with pytest.raises(ParseError, match=message):
        parse_csv(write(tmp_path, text))


def test_skips_blank_lines_and_strips_the_bom(tmp_path: Path) -> None:
    table = parse_csv(write(tmp_path, "\ufeffName,Value\nx,1\n\n,\ny,2\n"))
    assert [c.name for c in table.columns] == ["name", "value"]
    assert table.frame.height == 2


@pytest.mark.parametrize(
    ("name", "values", "expected"),
    [
        ("customer_id", ["1", "2", "3"], "id"),
        ("flag", ["yes", "No", "TRUE", ""], "boolean"),
        ("when", ["2025-01-01", "1/31/2025", "2025-02-01T10:00:00Z"], "datetime"),
        ("amount", ["$1,200.50", "3", "-4.5", "12%"], "numeric"),
        ("status", ["200", "404", "500", "200"], "categorical"),
        ("score", ["200", "404", "500", "200"], "numeric"),
        ("sku", [f"SKU-{i}" for i in range(300)], "id"),
        ("note", [f"note number {i}" for i in range(300)], "text"),
        ("empty", ["", " "], "text"),
    ],
)
def test_infers_types(name: str, values: list[str], expected: str) -> None:
    assert infer_type(name, pl.Series(name, values)) == expected


def test_coerces_dates_and_timestamps() -> None:
    days = coerce(pl.Series("d", ["2025-04-01", "4/2/2025", None, "nope"]), "datetime")
    assert days.dtype == pl.Date
    assert days.to_list() == [datetime.date(2025, 4, 1), datetime.date(2025, 4, 2), None, None]
    stamps = coerce(
        pl.Series("t", ["2025-09-18T16:05:43.000Z", "2025-09-18 18:05+02:00"]), "datetime"
    )
    assert stamps.dtype == pl.Datetime("ms", "UTC")
    assert [v.isoformat() for v in stamps.to_list()] == [
        "2025-09-18T16:05:43+00:00",
        "2025-09-18T16:05:00+00:00",
    ]


def test_coerces_numbers_to_integers_when_possible() -> None:
    assert coerce(pl.Series("n", ["1", "2,000", None]), "numeric").to_list() == [1, 2000, None]
    assert coerce(pl.Series("n", ["1.5", "x"]), "numeric").to_list() == [1.5, None]


def test_parses_xlsx_first_sheet(tmp_path: Path) -> None:
    path = tmp_path / "book.xlsx"
    workbook = xlsxwriter.Workbook(str(path))
    sheet = workbook.add_worksheet()
    date_format = workbook.add_format({"num_format": "yyyy-mm-dd"})
    sheet.write_row(0, 0, ["Order Date", "Revenue", "Region"])
    for i in range(3):
        sheet.write_datetime(i + 1, 0, datetime.datetime(2025, 1, i + 1), date_format)
        sheet.write_number(i + 1, 1, 10.5 * (i + 1))
        sheet.write_string(i + 1, 2, "North")
    workbook.add_worksheet("Other")
    workbook.close()

    profiled = profile_table(parse_xlsx(path))
    types = {c["name"]: c["inferred_type"] for c in profiled.columns}
    assert types == {"order_date": "datetime", "revenue": "numeric", "region": "categorical"}
    assert profiled.columns[0]["profile"]["datetime"]["min"] == "2025-01-01"


def test_rejects_broken_xlsx(tmp_path: Path) -> None:
    with pytest.raises(ParseError, match="Excel file couldn't be read"):
        parse_xlsx(write(tmp_path, "not a zip", "broken.xlsx"))
