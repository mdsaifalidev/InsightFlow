# syntax=docker/dockerfile:1

FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /uvx /bin/
# The virtualenv lives outside the bind-mounted repo (a named volume in dev),
# so Linux wheels never land in the host's services/data-py.
ENV UV_PROJECT_ENVIRONMENT=/venv \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1
WORKDIR /app/services/data-py

# Development: the repo is bind-mounted by docker-compose. The API container
# syncs dependencies and runs migrations; the worker reuses its venv volume.
FROM base AS dev
ENV WATCHFILES_FORCE_POLLING=true
EXPOSE 8000
CMD ["sh", "-c", "uv sync --frozen && uv run --no-sync alembic upgrade head && uv run --no-sync uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --reload"]

# Production image: dependencies first (cached layer), then the source.
FROM base AS runner
COPY services/data-py/pyproject.toml services/data-py/uv.lock services/data-py/.python-version ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY services/data-py/app ./app
COPY services/data-py/alembic ./alembic
COPY services/data-py/alembic.ini ./
COPY services/data-py/samples ./samples
RUN useradd --create-home app && mkdir -p /cache && chown app /cache
USER app
ENV CACHE_DIR=/cache
EXPOSE 8000
# The worker runs the same image: `arq app.worker.WorkerSettings`.
CMD ["sh", "-c", "/venv/bin/alembic upgrade head && /venv/bin/uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000 --workers 2"]
