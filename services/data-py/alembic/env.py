"""Alembic migrations for schema `analytics`, run as the service role (ADR-006).
The version table lives in `analytics` too; the service can't write to `public`.
"""

import asyncio

from sqlalchemy import pool, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import create_async_engine

from alembic import context
from app.config import get_settings
from app.db.models import SCHEMA, Base

target_metadata = Base.metadata


def _url() -> str:
    url: str = context.config.attributes.get("database_url") or get_settings().database_url
    return url


def _configure(connection: Connection) -> None:
    connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{SCHEMA}"'))
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=SCHEMA,
        include_schemas=True,
        include_name=lambda name, type_, _parent: type_ != "schema" or name == SCHEMA,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async() -> None:
    engine = create_async_engine(_url(), poolclass=pool.NullPool)
    async with engine.begin() as connection:
        await connection.run_sync(_configure)
    await engine.dispose()


if context.is_offline_mode():
    context.configure(url=_url(), target_metadata=target_metadata, version_table_schema=SCHEMA)
    with context.begin_transaction():
        context.run_migrations()
else:
    asyncio.run(run_async())
