"""Job progress over Server-Sent Events (ADR-008; PRD §9).

On connect the stream replays the job's current state, then forwards newer
events from Redis `job:{id}` until `done`. FastAPI sends a `: ping` comment
every 15s so proxies keep the connection open.
"""

import json
import uuid
from collections.abc import AsyncIterable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.sse import EventSourceResponse, ServerSentEvent
from sqlalchemy import select

from app.auth import CurrentPrincipal
from app.db.models import Job
from app.errors import Problem
from app.jobs import channel, current_event
from app.schemas import JobEvent, problems

router = APIRouter(prefix="/api/data/jobs")

# If no event arrives for this long, re-read the job row (covers a missed publish).
RECHECK_SECONDS = 20.0


def _event(event: dict[str, Any]) -> ServerSentEvent:
    return ServerSentEvent(event=event["event"], id=str(event["id"]), data=event["data"])


async def workspace_job(request: Request, principal: CurrentPrincipal, job_id: str) -> Job:
    """Resolved before the stream starts, so a missing job is a plain 404."""
    try:
        key = uuid.UUID(job_id)
    except ValueError:
        raise Problem(404, "Job not found") from None
    async with request.app.state.sessionmaker() as session:
        job: Job | None = await session.scalar(
            select(Job).where(Job.id == key, Job.workspace_id == principal.workspace_id)
        )
    if job is None:
        raise Problem(404, "Job not found")
    return job


@router.get(
    "/{job_id}/events",
    response_class=EventSourceResponse,
    responses={
        200: {
            "model": JobEvent,
            "description": "`progress` events until a final `done` event.",
        },
        **problems(401, 404),
    },
)
async def job_events(
    request: Request, job: Annotated[Job, Depends(workspace_job)]
) -> AsyncIterable[ServerSentEvent]:
    sessionmaker = request.app.state.sessionmaker
    pubsub = request.app.state.redis.pubsub()
    # Subscribe before reading the state, so no event falls in between.
    await pubsub.subscribe(channel(job.id))
    try:
        async with sessionmaker() as fresh:
            job = await fresh.get(Job, job.id) or job
        state = current_event(job)
        yield _event(state)
        if state["event"] == "done":
            return
        last = int(state["id"])
        while True:
            message = await pubsub.get_message(
                ignore_subscribe_messages=True, timeout=RECHECK_SECONDS
            )
            if message is None:
                async with sessionmaker() as fresh:
                    current = await fresh.get(Job, job.id)
                if current is None:
                    return
                event = current_event(current)
            else:
                event = json.loads(message["data"])
            if int(event["id"]) <= last:
                continue
            last = int(event["id"])
            yield _event(event)
            if event["event"] == "done":
                return
    finally:
        await pubsub.unsubscribe()
        await pubsub.aclose()
