"""Ingest pipeline run by the ARQ worker (PRD F2, ARCHITECTURE §3.2):
parse → infer types → Parquet → profile → dashboard → brief.

Each run starts from scratch, so a retried job is idempotent. A dataset only
becomes `ready` once every stage has finished.
"""

import asyncio
import contextlib
import uuid
from dataclasses import dataclass

from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app import analytics
from app.config import Settings
from app.datasets import (
    delete_parquet,
    load_parsed,
    profile_table,
    save_columns,
    write_parquet,
)
from app.db.models import Dataset, Job
from app.engine.parse import ParseError
from app.jobs import (
    INGEST_FAILED,
    INGEST_STAGES,
    INSIGHT_FAILED,
    INSIGHT_STAGE,
    JobGone,
    finish,
    now,
    report,
)
from app.log import log
from app.storage import Storage


@dataclass
class Context:
    sessionmaker: async_sessionmaker[AsyncSession]
    redis: Redis
    storage: Storage
    settings: Settings


class RetryableError(Exception):
    """An unexpected failure the worker should retry."""


async def _load(session: AsyncSession, job_id: uuid.UUID) -> tuple[Job, Dataset] | None:
    job = await session.get(Job, job_id)
    if job is None or job.stage in ("ready", "failed"):
        return None
    dataset = await session.get(Dataset, job.dataset_id)
    return (job, dataset) if dataset else None


async def _dataset(session: AsyncSession, dataset_id: uuid.UUID) -> Dataset:
    dataset = await session.get(Dataset, dataset_id, populate_existing=True)
    if dataset is None:
        raise JobGone(str(dataset_id))
    return dataset


async def run_ingest(ctx: Context, job_id: uuid.UUID, *, final_attempt: bool) -> None:
    async with ctx.sessionmaker() as session:
        loaded = await _load(session, job_id)
        if loaded is None:
            return
        job, dataset = loaded
        job.attempts += 1
        job.started_at = now()
        dataset.status = "processing"
        dataset.error_message = None
        await session.commit()
        dataset_id = dataset.id
        queued, parsing, profiling, building, writing = INGEST_STAGES

        try:
            await report(session, ctx.redis, job_id, queued, queued.start)
            await report(session, ctx.redis, job_id, queued, queued.end)

            await report(session, ctx.redis, job_id, parsing, parsing.start)
            dataset = await _dataset(session, dataset_id)
            table = await load_parsed(dataset, ctx.storage, ctx.settings)
            dataset.row_count = table.frame.height
            dataset.column_count = len(table.columns)
            await session.commit()
            await report(session, ctx.redis, job_id, parsing, parsing.end)

            await report(session, ctx.redis, job_id, profiling, profiling.start)
            dataset = await _dataset(session, dataset_id)
            # A retried run starts clean: drop Parquet left by an earlier attempt.
            await delete_parquet(dataset, ctx.storage)
            dataset.parquet_object_key = None
            profiled = await asyncio.to_thread(profile_table, table)
            dataset.parquet_object_key = await write_parquet(dataset, profiled.frame, ctx.storage)
            await save_columns(session, dataset_id, profiled.columns)
            dataset.date_column = next(
                (c["name"] for c in profiled.columns if c["inferred_type"] == "datetime"), None
            )
            await session.commit()
            await report(session, ctx.redis, job_id, profiling, profiling.end)

            await report(session, ctx.redis, job_id, building, building.start)
            dataset = await _dataset(session, dataset_id)
            await analytics.build_dashboard(session, dataset, ctx.storage, ctx.settings)
            await report(session, ctx.redis, job_id, building, building.end)

            await report(session, ctx.redis, job_id, writing, writing.start)
            dataset = await _dataset(session, dataset_id)
            try:
                await analytics.generate_insight(session, dataset, ctx.storage, ctx.settings)
            except Exception:
                # The dataset is usable without a brief; GET /insights/latest
                # writes one on demand.
                await session.rollback()
                log.exception("brief_failed", job_id=str(job_id))
            await report(session, ctx.redis, job_id, writing, writing.end)

            dataset = await _dataset(session, dataset_id)
            dataset.status = "ready"
            dataset.ready_at = now()
            await session.commit()
            await finish(session, ctx.redis, job_id)
        except JobGone:
            await session.rollback()
            log.info("ingest_abandoned", job_id=str(job_id), reason="deleted")
        except ParseError as error:
            await session.rollback()
            await _fail(session, ctx.redis, job_id, dataset_id, str(error))
        except Exception as error:
            await session.rollback()
            log.exception("ingest_failed", job_id=str(job_id), final=final_attempt)
            if not final_attempt:
                raise RetryableError(str(error)) from error
            await _fail(session, ctx.redis, job_id, dataset_id, INGEST_FAILED)


async def _fail(
    session: AsyncSession, redis: Redis, job_id: uuid.UUID, dataset_id: uuid.UUID, message: str
) -> None:
    dataset = await session.get(Dataset, dataset_id, populate_existing=True)
    if dataset is None:
        return
    dataset.status = "failed"
    dataset.error_message = message
    await session.commit()
    with contextlib.suppress(JobGone):
        await finish(session, redis, job_id, error=message)


async def run_insight(ctx: Context, job_id: uuid.UUID, *, final_attempt: bool) -> None:
    """Regenerates a brief (POST /insights) as a one-stage job."""
    async with ctx.sessionmaker() as session:
        loaded = await _load(session, job_id)
        if loaded is None:
            return
        job, dataset = loaded
        job.attempts += 1
        job.started_at = now()
        await session.commit()
        try:
            await report(session, ctx.redis, job_id, INSIGHT_STAGE, INSIGHT_STAGE.start)
            dataset = await _dataset(session, dataset.id)
            await analytics.generate_insight(session, dataset, ctx.storage, ctx.settings)
            await report(session, ctx.redis, job_id, INSIGHT_STAGE, INSIGHT_STAGE.end)
            await finish(session, ctx.redis, job_id)
        except JobGone:
            await session.rollback()
        except Exception as error:
            await session.rollback()
            log.exception("insight_failed", job_id=str(job_id), final=final_attempt)
            if not final_attempt:
                raise RetryableError(str(error)) from error
            with contextlib.suppress(JobGone):
                await finish(session, ctx.redis, job_id, error=INSIGHT_FAILED)
