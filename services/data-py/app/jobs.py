"""Job progress: every change is written to the jobs row and published on Redis
`job:{id}` for SSE subscribers (ADR-008). The row's `seq` is the SSE event id,
so a reconnecting client gets the current state and then only newer events.
"""

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Job


@dataclass(frozen=True)
class Stage:
    stage: str
    start: int
    end: int
    message: str


# Same stages, ranges and messages as the MSW mock (apps/web/mocks/db/jobs.ts).
INGEST_STAGES = [
    Stage("queued", 2, 5, "Waiting for a worker"),
    Stage("parsing", 8, 35, "Reading rows"),
    Stage("profiling", 40, 60, "Profiling columns"),
    Stage("building_dashboard", 65, 80, "Choosing charts"),
    Stage("generating_insight", 85, 97, "Writing the brief"),
]
INSIGHT_STAGE = Stage("generating_insight", 20, 90, "Writing the brief")
MESSAGES = {s.stage: s.message for s in INGEST_STAGES}

INGEST_FAILED = "Processing failed unexpectedly. Try uploading the file again."
INSIGHT_FAILED = "The brief couldn't be regenerated. Try again."


class JobGone(Exception):
    """The job (or its dataset) was deleted while running."""


def channel(job_id: uuid.UUID | str) -> str:
    return f"job:{job_id}"


def now() -> datetime:
    return datetime.now(UTC)


def progress_event(job: Job) -> dict[str, Any]:
    return {
        "jobId": str(job.id),
        "stage": job.stage,
        "progress": job.progress,
        "message": job.message or MESSAGES.get(job.stage, ""),
    }


def done_event(job: Job) -> dict[str, Any]:
    data: dict[str, Any] = {
        "jobId": str(job.id),
        "datasetId": str(job.dataset_id),
        "status": job.stage,
    }
    if job.error:
        data["errorMessage"] = job.error
    return data


def current_event(job: Job) -> dict[str, Any]:
    """The job's state as an SSE event, replayed first on every connection."""
    if job.stage in ("ready", "failed"):
        return {"id": job.seq, "event": "done", "data": done_event(job)}
    return {"id": job.seq, "event": "progress", "data": progress_event(job)}


async def _publish(
    session: AsyncSession, redis: Redis, job_id: uuid.UUID, values: dict[str, Any]
) -> Job:
    result = await session.execute(
        update(Job)
        .where(Job.id == job_id)
        .values(seq=Job.seq + 1, **values)
        .returning(Job)
        .execution_options(synchronize_session=False, populate_existing=True)
    )
    job = result.scalar_one_or_none()
    await session.commit()
    if job is None:
        raise JobGone(str(job_id))
    await redis.publish(channel(job_id), json.dumps(current_event(job)))
    return job


async def report(
    session: AsyncSession, redis: Redis, job_id: uuid.UUID, stage: Stage, progress: int
) -> Job:
    return await _publish(
        session,
        redis,
        job_id,
        {"stage": stage.stage, "progress": progress, "message": stage.message},
    )


async def finish(
    session: AsyncSession,
    redis: Redis,
    job_id: uuid.UUID,
    *,
    error: str | None = None,
) -> Job:
    values: dict[str, Any] = {"finished_at": now(), "error": error}
    values.update({"stage": "failed"} if error else {"stage": "ready", "progress": 100})
    return await _publish(session, redis, job_id, values)
