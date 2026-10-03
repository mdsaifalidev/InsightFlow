"""Dataset library, uploads and column types (PRD §9; mirrors
apps/web/mocks/handlers/datasets.ts status codes and messages).
"""

import asyncio
import re
import time
import uuid
from datetime import UTC, datetime
from typing import Any, cast

import polars as pl
from fastapi import APIRouter, Request, Response
from sqlalchemy import func, nulls_last, or_, select

from app import analytics
from app.auth import CurrentPrincipal, Principal
from app.config import Settings
from app.datasets import (
    SAMPLES,
    columns_of,
    date_column_of,
    delete_files,
    load_parsed,
    write_parquet,
)
from app.db.models import Dataset, Job
from app.db.session import Session
from app.engine.parse import ParseError
from app.engine.profile import profile_column
from app.engine.types import COLUMN_TYPES, ColumnType, coerce
from app.errors import Problem, not_found
from app.schemas import (
    UNSET,
    ColumnTypeRequest,
    DatasetDetail,
    DatasetList,
    SampleRequest,
    UploadResponse,
    problems,
)
from app.schemas import DatasetColumn as DatasetColumnModel
from app.serialize import column_json, dataset_json
from app.storage import Storage, raw_key
from app.upload import receive_upload

router = APIRouter(prefix="/api/data/datasets")
PAGE_SIZE = 50


async def find_dataset(session: Session, principal: Principal, dataset_id: str) -> Dataset:
    """A dataset in the caller's workspace, or a 404 (never a 403)."""
    try:
        key = uuid.UUID(dataset_id)
    except ValueError:
        raise not_found() from None
    dataset = await session.scalar(
        select(Dataset).where(Dataset.id == key, Dataset.workspace_id == principal.workspace_id)
    )
    if dataset is None:
        raise not_found()
    return dataset


async def create_dataset(request: Request, session: Session, dataset: Dataset) -> dict[str, Any]:
    """Saves a new dataset with its ingest job and queues the job."""
    job = Job(
        id=uuid.uuid4(),
        dataset_id=dataset.id,
        workspace_id=dataset.workspace_id,
        kind="ingest",
        stage="queued",
        progress=0,
        message="Waiting for a worker",
    )
    dataset.job_id = job.id
    session.add(dataset)
    await session.flush()
    session.add(job)
    await session.commit()
    await request.app.state.arq.enqueue_job(
        "ingest_dataset", str(job.id), _job_id=f"ingest:{job.id}"
    )
    return {"dataset": dataset_json(dataset), "jobId": str(job.id)}


@router.get("", response_model=DatasetList, responses=problems(401), **UNSET)
async def list_datasets(
    session: Session,
    principal: CurrentPrincipal,
    q: str = "",
    sort: str = "newest",
    cursor: str | None = None,
) -> dict[str, Any]:
    offset = int(cursor) if cursor and cursor.isdigit() else 0
    query = select(Dataset).where(Dataset.workspace_id == principal.workspace_id)
    if q.strip():
        pattern = f"%{q.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Dataset.name).like(pattern),
                func.lower(Dataset.original_filename).like(pattern),
            )
        )
    if sort == "name":
        query = query.order_by(func.lower(Dataset.name), Dataset.name)
    elif sort == "rows":
        query = query.order_by(nulls_last(Dataset.row_count.desc()), Dataset.created_at.desc())
    else:
        query = query.order_by(Dataset.created_at.desc())
    rows = list(await session.scalars(query.offset(offset).limit(PAGE_SIZE + 1)))
    return {
        "items": [dataset_json(d) for d in rows[:PAGE_SIZE]],
        "nextCursor": str(offset + PAGE_SIZE) if len(rows) > PAGE_SIZE else None,
    }


@router.post(
    "",
    status_code=202,
    response_model=UploadResponse,
    responses=problems(401, 413, 415, 422),
    **UNSET,
)
async def upload_dataset(
    request: Request, response: Response, session: Session, principal: CurrentPrincipal
) -> dict[str, Any]:
    """Multipart upload (`file`, optional `name`), streamed to object storage
    while it arrives (app/upload.py)."""
    settings: Settings = request.app.state.settings
    dataset_id = uuid.uuid4()
    upload = await receive_upload(
        request.stream(),
        request.headers.get("content-type", ""),
        request.app.state.storage,
        f"raw/{principal.workspace_id}/{dataset_id}",
        settings.max_upload_bytes,
    )
    # Server-Timing: time from the last byte received to the response (PRD §7: < 1s).
    finished = time.perf_counter()
    dataset = Dataset(
        id=dataset_id,
        workspace_id=principal.workspace_id,
        name=upload.name.strip() or re.sub(r"\.[^.]+$", "", upload.filename),
        original_filename=upload.filename,
        file_type=upload.file_type,
        size_bytes=upload.size,
        raw_object_key=raw_key(principal.workspace_id, dataset_id, upload.file_type),
        status="queued",
        created_at=datetime.now(UTC),
    )
    body = await create_dataset(request, session, dataset)
    response.headers["Server-Timing"] = f"app;dur={(time.perf_counter() - finished) * 1000:.0f}"
    return body


@router.post(
    "/sample",
    status_code=202,
    response_model=UploadResponse,
    responses=problems(401, 422),
    **UNSET,
)
async def create_sample(
    request: Request, session: Session, principal: CurrentPrincipal, body: SampleRequest
) -> dict[str, Any]:
    settings: Settings = request.app.state.settings
    sample = SAMPLES.get(body.key or "")
    if sample is None:
        raise Problem(
            422, "Validation failed", "Unknown sample dataset.", {"key": "Unknown sample."}
        )
    path = settings.samples_dir / f"{body.key}.csv"
    dataset = Dataset(
        id=uuid.uuid4(),
        workspace_id=principal.workspace_id,
        name=sample["name"],
        original_filename=sample["filename"],
        file_type="csv",
        size_bytes=path.stat().st_size,
        sample_key=body.key,
        status="queued",
        created_at=datetime.now(UTC),
    )
    return await create_dataset(request, session, dataset)


@router.get("/{dataset_id}", response_model=DatasetDetail, responses=problems(401, 404), **UNSET)
async def get_dataset(
    session: Session, principal: CurrentPrincipal, dataset_id: str
) -> dict[str, Any]:
    dataset = await find_dataset(session, principal, dataset_id)
    columns = await columns_of(session, dataset.id)
    return {**dataset_json(dataset), "columns": [column_json(c) for c in columns]}


@router.delete("/{dataset_id}", status_code=204, responses=problems(401, 404))
async def delete_dataset(
    request: Request, session: Session, principal: CurrentPrincipal, dataset_id: str
) -> Response:
    dataset = await find_dataset(session, principal, dataset_id)
    await session.delete(dataset)
    await session.commit()
    # Rows are gone (cascade); files are removed after, so a failure here only
    # leaves unreachable objects behind.
    await delete_files(dataset, request.app.state.storage)
    return Response(status_code=204)


@router.patch(
    "/{dataset_id}/columns/{column_id}",
    response_model=DatasetColumnModel,
    responses=problems(401, 404, 409, 422),
    **UNSET,
)
async def set_column_type(
    request: Request,
    session: Session,
    principal: CurrentPrincipal,
    dataset_id: str,
    column_id: str,
    body: ColumnTypeRequest,
) -> dict[str, Any]:
    dataset = await find_dataset(session, principal, dataset_id)
    requested = body.type
    if requested is not None and requested not in COLUMN_TYPES:
        raise Problem(
            422, "Validation failed", "Choose a valid column type.", {"type": "Invalid type."}
        )
    if dataset.status != "ready":
        raise Problem(
            409,
            "Dataset not ready",
            "Wait for processing to finish before changing column types.",
        )
    column = next(
        (c for c in await columns_of(session, dataset.id) if str(c.id) == column_id), None
    )
    if column is None:
        raise Problem(404, "Column not found")

    storage: Storage = request.app.state.storage
    settings: Settings = request.app.state.settings
    effective = cast(ColumnType, requested or column.inferred_type)
    # Re-coerce from the original strings, so switching back is lossless.
    try:
        table = await load_parsed(dataset, storage, settings)
    except ParseError as error:
        raise Problem(409, "Dataset not ready", str(error)) from error
    typed = await asyncio.to_thread(coerce, table.frame[column.name], effective)
    assert dataset.parquet_object_key
    path = await storage.parquet_path(dataset.parquet_object_key)
    frame = await asyncio.to_thread(lambda: pl.read_parquet(path).with_columns(typed))
    dataset.parquet_object_key = await write_parquet(dataset, frame, storage)

    column.override_type = requested if requested and requested != column.inferred_type else None
    column.profile = await asyncio.to_thread(profile_column, typed, effective)
    columns = await columns_of(session, dataset.id)
    dataset.date_column = date_column_of(columns)
    await session.commit()
    # Charts and the brief depend on column types.
    await analytics.build_dashboard(session, dataset, storage, settings)
    await analytics.generate_insight(session, dataset, storage, settings)
    await session.refresh(column)
    return column_json(column)
