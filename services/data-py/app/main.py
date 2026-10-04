"""InsightFlow data service (FastAPI). Routes live under /api/data, behind the
nginx gateway; tokens are verified locally against the auth service's JWKS.

Run with: uvicorn app.main:create_app --factory
"""

import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from arq import create_pool
from arq.connections import RedisSettings
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from app.auth import JwksCache
from app.config import Settings, get_settings
from app.db.session import create_engine, create_sessionmaker
from app.errors import install_error_handlers
from app.log import configure_logging
from app.routes import analytics, datasets, insights, jobs, meta
from app.storage import Storage


def create_app(settings: Settings | None = None, jwks: JwksCache | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = create_engine(settings.database_url)
        arq = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.settings = settings
        app.state.engine = engine
        app.state.sessionmaker = create_sessionmaker(engine)
        # ArqRedis is a redis.asyncio client: it also carries pub/sub for SSE.
        app.state.arq = arq
        app.state.redis = arq
        app.state.storage = Storage(settings)
        app.state.jwks = jwks or JwksCache(settings.jwks_url)
        try:
            yield
        finally:
            await app.state.jwks.aclose()
            await arq.aclose()
            await engine.dispose()

    app = FastAPI(
        title="InsightFlow data service",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/data/docs",
        openapi_url="/api/data/openapi.json",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            settings.web_origin,
            "https://useinsightflow.vercel.app",
            "https://insight-flow-bice-seven.vercel.app",
            "http://localhost:3000",
        ],
        allow_origin_regex=r"https://.*\.vercel\.app",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def request_id(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        structlog.contextvars.bind_contextvars(request_id=rid)
        try:
            response = await call_next(request)
        finally:
            structlog.contextvars.clear_contextvars()
        response.headers["X-Request-ID"] = rid
        if response.headers.get("content-type", "").startswith("text/event-stream"):
            # Proxies and compression middleware (e.g. the Next dev rewrite)
            # must not gzip the stream: that holds events back until the end.
            response.headers["Cache-Control"] = "no-cache, no-transform"
        return response

    install_error_handlers(app)
    app.include_router(meta.router)
    app.include_router(datasets.router)
    app.include_router(jobs.router)
    app.include_router(analytics.router)
    app.include_router(insights.router)
    return app
