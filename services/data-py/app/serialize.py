"""API shapes (camelCase), matching apps/web/lib/api/types.ts."""

from datetime import UTC, datetime
from typing import Any

from app.db.models import Dataset, DatasetColumn


def iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def dataset_json(dataset: Dataset) -> dict[str, Any]:
    return {
        "id": str(dataset.id),
        "name": dataset.name,
        "originalFilename": dataset.original_filename,
        "fileType": dataset.file_type,
        "sizeBytes": dataset.size_bytes,
        "rowCount": dataset.row_count,
        "columnCount": dataset.column_count,
        "status": dataset.status,
        "errorMessage": dataset.error_message,
        "jobId": str(dataset.job_id) if dataset.job_id else None,
        "createdAt": iso(dataset.created_at),
        "readyAt": iso(dataset.ready_at),
    }


def column_json(column: DatasetColumn) -> dict[str, Any]:
    return {
        "id": str(column.id),
        "name": column.name,
        "originalName": column.original_name,
        "position": column.position,
        "inferredType": column.inferred_type,
        "overrideType": column.override_type,
        "profile": column.profile,
    }
