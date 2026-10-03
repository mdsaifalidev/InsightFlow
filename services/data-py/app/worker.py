"""ARQ worker (ADR-005): runs ingest and brief jobs, and cleans up after
account deletions announced by the auth service.

Run with: arq app.worker.WorkerSettings
"""

import asyncio
import uuid
from typing import Any, ClassVar

from arq import Retry
from arq.connections import RedisSettings

from app.config import get_settings
from app.db.session import create_engine, create_sessionmaker
from app.events import listen_for_deleted_users
from app.log import configure_logging, log
from app.pipeline import Context, RetryableError, run_ingest, run_insight
from app.storage import Storage

MAX_TRIES = 3


def _context(ctx: dict[str, Any]) -> Context:
    context: Context = ctx["app"]
    return context


async def _run(ctx: dict[str, Any], runner: Any, job_id: str) -> None:
    attempt: int = ctx.get("job_try", 1)
    try:
        await runner(_context(ctx), uuid.UUID(job_id), final_attempt=attempt >= MAX_TRIES)
    except RetryableError as error:
        # Backoff: 2s, 4s.
        raise Retry(defer=2**attempt) from error


async def ingest_dataset(ctx: dict[str, Any], job_id: str) -> None:
    await _run(ctx, run_ingest, job_id)


async def generate_insight(ctx: dict[str, Any], job_id: str) -> None:
    await _run(ctx, run_insight, job_id)


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = create_engine(settings.database_url)
    ctx["engine"] = engine
    ctx["app"] = Context(
        sessionmaker=create_sessionmaker(engine),
        redis=ctx["redis"],
        storage=Storage(settings),
        settings=settings,
    )
    ctx["listener"] = asyncio.create_task(listen_for_deleted_users(ctx["app"]))
    log.info("worker_ready")


async def shutdown(ctx: dict[str, Any]) -> None:
    listener: asyncio.Task[None] | None = ctx.get("listener")
    if listener:
        listener.cancel()
    engine = ctx.get("engine")
    if engine:
        await engine.dispose()


class WorkerSettings:
    functions: ClassVar[list[Any]] = [ingest_dataset, generate_insight]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_tries = MAX_TRIES
    job_timeout = 600
    keep_result = 60
