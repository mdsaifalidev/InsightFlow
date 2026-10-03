"""Dataset files: where a dataset's raw file and typed Parquet live, and how a
parsed table becomes typed columns with profiles.
"""

import asyncio
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.db.models import Dataset, DatasetColumn
from app.engine.parse import ParsedTable, parse_file
from app.engine.profile import profile_column
from app.engine.types import ColumnType, coerce, infer_type
from app.storage import Storage, parquet_key

SAMPLES: dict[str, dict[str, str]] = {
    "orders": {"name": "E-commerce orders", "filename": "orders_2025.csv"},
    "saas": {"name": "SaaS subscriptions", "filename": "subscriptions_monthly.csv"},
    "weblogs": {"name": "Web traffic logs", "filename": "access_logs_sep.csv"},
}


@dataclass
class ProfiledTable:
    frame: pl.DataFrame
    columns: list[dict[str, Any]]


def effective_type(column: DatasetColumn) -> ColumnType:
    return column.override_type or column.inferred_type  # type: ignore[return-value]


def profile_table(table: ParsedTable) -> ProfiledTable:
    """Infers, coerces and profiles every column of a parsed table."""
    series: list[pl.Series] = []
    columns: list[dict[str, Any]] = []
    for position, column in enumerate(table.columns):
        raw = table.frame[column.name]
        column_type = infer_type(column.name, raw)
        typed = coerce(raw, column_type)
        series.append(typed)
        columns.append(
            {
                "name": column.name,
                "original_name": column.original_name,
                "position": position,
                "inferred_type": column_type,
                "profile": profile_column(typed, column_type),
            }
        )
    return ProfiledTable(frame=pl.DataFrame(series), columns=columns)


async def source_path(dataset: Dataset, storage: Storage, settings: Settings) -> Path:
    """Local path of the dataset's original file."""
    if dataset.sample_key:
        return settings.samples_dir / f"{dataset.sample_key}.csv"
    assert dataset.raw_object_key
    path = storage.cache_path(dataset.raw_object_key)
    if not path.exists():
        await storage.download(storage.raw_bucket, dataset.raw_object_key, path)
    return path


async def load_parsed(dataset: Dataset, storage: Storage, settings: Settings) -> ParsedTable:
    path = await source_path(dataset, storage, settings)
    return await asyncio.to_thread(parse_file, path, dataset.file_type)


async def write_parquet(dataset: Dataset, frame: pl.DataFrame, storage: Storage) -> str:
    """Stores a new Parquet version and returns its key; the old one is removed."""
    key = parquet_key(dataset.workspace_id, dataset.id)
    cached = storage.cache_path(key)
    cached.parent.mkdir(parents=True, exist_ok=True)
    # Written next to its final name: a rename across volumes would fail.
    partial = cached.with_suffix(".part")
    try:
        await asyncio.to_thread(frame.write_parquet, partial, compression="zstd", statistics=True)
        await storage.upload_file(storage.parquet_bucket, key, partial)
        partial.replace(cached)
    finally:
        partial.unlink(missing_ok=True)
    if dataset.parquet_object_key:
        await storage.delete(storage.parquet_bucket, dataset.parquet_object_key)
        storage.cache_path(dataset.parquet_object_key).unlink(missing_ok=True)
    return key


async def save_columns(
    session: AsyncSession, dataset_id: uuid.UUID, columns: list[dict[str, Any]]
) -> None:
    await session.execute(delete(DatasetColumn).where(DatasetColumn.dataset_id == dataset_id))
    session.add_all(DatasetColumn(dataset_id=dataset_id, **column) for column in columns)


async def columns_of(session: AsyncSession, dataset_id: uuid.UUID) -> list[DatasetColumn]:
    result = await session.scalars(
        select(DatasetColumn)
        .where(DatasetColumn.dataset_id == dataset_id)
        .order_by(DatasetColumn.position)
    )
    return list(result)


def date_column_of(columns: list[DatasetColumn]) -> str | None:
    """The first column the user treats as a date (respects type overrides)."""
    return next((c.name for c in columns if effective_type(c) == "datetime"), None)


async def delete_parquet(dataset: Dataset, storage: Storage) -> None:
    prefix = f"parquet/{dataset.workspace_id}/{dataset.id}/"
    await storage.delete_prefix(storage.parquet_bucket, prefix)
    storage.evict(prefix)


async def delete_files(dataset: Dataset, storage: Storage) -> None:
    if dataset.raw_object_key:
        await storage.delete(storage.raw_bucket, dataset.raw_object_key)
        storage.cache_path(dataset.raw_object_key).unlink(missing_ok=True)
    await delete_parquet(dataset, storage)
