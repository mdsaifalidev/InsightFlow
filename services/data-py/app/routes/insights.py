"""The brief (PRD F8): latest insight and regeneration (mirrors
apps/web/mocks/handlers/insights.ts).
"""

import math
import time
import uuid
from typing import Any

from fastapi import APIRouter, Request

from app.analytics import generate_insight, insight_json, latest_insight
from app.auth import CurrentPrincipal
from app.db.models import Job
from app.db.session import Session
from app.errors import Problem
from app.jobs import INSIGHT_STAGE
from app.routes.datasets import find_dataset
from app.schemas import UNSET, RegenerateInsightResponse, problems
from app.schemas import Insight as InsightModel

router = APIRouter(prefix="/api/data/datasets")

WINDOW_SECONDS = 60 * 60


@router.get(
    "/{dataset_id}/insights/latest",
    response_model=InsightModel,
    responses=problems(401, 404, 409),
    **UNSET,
)
async def get_latest(
    request: Request, session: Session, principal: CurrentPrincipal, dataset_id: str
) -> dict[str, Any]:
    dataset = await find_dataset(session, principal, dataset_id)
    if dataset.status != "ready":
        raise Problem(409, "Dataset not ready", "The brief is written once processing finishes.")
    insight = await latest_insight(session, dataset)
    if insight is None:
        # Normally written during ingest; this covers a brief that failed there.
        state = request.app.state
        insight = await generate_insight(session, dataset, state.storage, state.settings)
    return insight_json(insight)


async def _check_rate_limit(request: Request, dataset_id: uuid.UUID) -> None:
    """At most N regenerations per dataset in a sliding hour (Redis sorted set)."""
    redis = request.app.state.redis
    limit: int = request.app.state.settings.insight_regenerations_per_hour
    key = f"insight-regen:{dataset_id}"
    now = time.time()
    await redis.zremrangebyscore(key, 0, now - WINDOW_SECONDS)
    recent = await redis.zrange(key, 0, 0, withscores=True)
    if await redis.zcard(key) >= limit:
        oldest = recent[0][1] if recent else now
        retry_after = max(1, math.ceil(oldest + WINDOW_SECONDS - now))
        raise Problem(
            429,
            "Too many regenerations",
            f"You can regenerate the brief {limit} times an hour.",
            headers={"Retry-After": str(retry_after)},
        )
    await redis.zadd(key, {uuid.uuid4().hex: now})
    await redis.expire(key, WINDOW_SECONDS)


@router.post(
    "/{dataset_id}/insights",
    status_code=202,
    response_model=RegenerateInsightResponse,
    responses=problems(401, 404, 429),
    **UNSET,
)
async def regenerate(
    request: Request, session: Session, principal: CurrentPrincipal, dataset_id: str
) -> dict[str, str]:
    dataset = await find_dataset(session, principal, dataset_id)
    await _check_rate_limit(request, dataset.id)
    job = Job(
        id=uuid.uuid4(),
        dataset_id=dataset.id,
        workspace_id=dataset.workspace_id,
        kind="insight",
        stage=INSIGHT_STAGE.stage,
        progress=0,
        message=INSIGHT_STAGE.message,
    )
    session.add(job)
    await session.commit()
    await request.app.state.arq.enqueue_job(
        "generate_insight", str(job.id), _job_id=f"insight:{job.id}"
    )
    return {"jobId": str(job.id)}
