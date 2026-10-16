from typing import Any

from fastapi import APIRouter, Request, Response
from sqlalchemy import text

from app.errors import Problem
from app.schemas import Health

router = APIRouter()


@router.get("/health", response_model=Health)
@router.get("/api/data/health", response_model=Health)
@router.head("/health", include_in_schema=False)
@router.head("/api/data/health", include_in_schema=False)
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/ready")
@router.head("/ready", include_in_schema=False)
async def ready(request: Request) -> dict[str, Any] | Response:
    """Ready when Postgres and Redis answer."""
    try:
        async with request.app.state.sessionmaker() as session:
            await session.execute(text("select 1"))
        await request.app.state.redis.ping()
    except Exception as error:
        raise Problem(503, "Not ready", str(error)) from error
    return {"status": "ready"}
