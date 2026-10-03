"""File parsing for uploads (PRD F2): every cell is read as a string; types are
inferred afterwards (types.py). Port of apps/web/mocks/db/engine/parse.ts.
"""

import csv
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import fastexcel
import polars as pl


class ParseError(Exception):
    """A problem with the file itself; the message is shown to the user."""


@dataclass(frozen=True)
class ParsedColumn:
    name: str
    original_name: str


@dataclass(frozen=True)
class ParsedTable:
    columns: list[ParsedColumn]
    # One String column per parsed column, named by the normalized name.
    frame: pl.DataFrame


def normalize_column_names(headers: list[str]) -> list[ParsedColumn]:
    """snake_case, ASCII-safe, unique column names; keeps the original header."""
    seen: dict[str, int] = {}
    columns: list[ParsedColumn] = []
    for i, header in enumerate(headers):
        original = (header or "").strip()
        name = unicodedata.normalize("NFKD", original.lower())
        name = re.sub(r"[^\w\s-]", "", name, flags=re.ASCII)
        name = re.sub(r"[\s-]+", "_", name)
        name = re.sub(r"_+", "_", name).strip("_")
        if not name:
            name = f"column_{i + 1}"
        if name[0].isdigit():
            name = f"c_{name}"
        n = seen.get(name, 0) + 1
        seen[name] = n
        columns.append(
            ParsedColumn(name=f"{name}_{n}" if n > 1 else name, original_name=original or name)
        )
    return columns


def _to_table(grid: pl.DataFrame) -> ParsedTable:
    if grid.height == 0:
        raise ParseError("The file has no header row. The first row must contain column names.")
    header = [str(v) if v is not None else "" for v in grid.row(0)]
    if all(not h.strip() for h in header):
        raise ParseError("The file has no header row. The first row must contain column names.")
    body = grid.slice(1)
    # Rows where every cell is blank are skipped, like blank lines.
    body = body.filter(~pl.all_horizontal(pl.all().is_null() | (pl.all().str.strip_chars() == "")))
    if body.height == 0:
        raise ParseError("The file has a header row but no data rows.")
    columns = normalize_column_names(header)
    frame = body.rename({old: col.name for old, col in zip(body.columns, columns, strict=True)})
    return ParsedTable(columns=columns, frame=frame)


def _csv_error(path: Path) -> ParseError:
    """Finds the first structural problem, for a message that names the row."""
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, strict=True)
        width: int | None = None
        try:
            for row in reader:
                if not any(cell.strip() for cell in row):
                    continue
                if width is None:
                    width = len(row)
                elif len(row) != width:
                    # Row numbers count the header as row 1, like a spreadsheet.
                    return ParseError(
                        f"Row {reader.line_num:,} has {len(row)} columns, expected {width}."
                    )
        except csv.Error:
            return ParseError(
                f"Row {reader.line_num:,} has an unclosed quote. Check the file's quoting."
            )
    return ParseError("This file couldn't be read as CSV. Save it as UTF-8 CSV and try again.")


def parse_csv(path: Path) -> ParsedTable:
    try:
        grid = pl.read_csv(
            path,
            has_header=False,
            infer_schema=False,
            encoding="utf8-lossy",
            # Short rows are padded with nulls; only extra cells are an error.
            truncate_ragged_lines=False,
        )
    except pl.exceptions.NoDataError as error:
        raise ParseError(
            "The file has no header row. The first row must contain column names."
        ) from error
    except pl.exceptions.PolarsError as error:
        raise _csv_error(path) from error
    if grid.height and grid.width:
        first = grid.columns[0]
        grid = grid.with_columns(
            pl.when(pl.int_range(pl.len()) == 0)
            .then(pl.col(first).str.strip_prefix("\ufeff"))
            .otherwise(pl.col(first))
            .alias(first)
        )
    return _to_table(grid)


def parse_xlsx(path: Path) -> ParsedTable:
    try:
        sheet = fastexcel.read_excel(path).load_sheet(0, header_row=None, dtypes="string")
        grid = pl.DataFrame(sheet.to_polars())
    except Exception as error:
        raise ParseError(
            "This Excel file couldn't be read. Save it as .xlsx and try again."
        ) from error
    # Excel dates arrive as "2025-01-05 00:00:00"; midnight means a plain date.
    grid = grid.with_columns(pl.all().str.replace(r"^(\d{4}-\d{2}-\d{2}) 00:00:00$", "${1}"))
    return _to_table(grid)


def parse_file(path: Path, file_type: str) -> ParsedTable:
    return parse_xlsx(path) if file_type == "xlsx" else parse_csv(path)
