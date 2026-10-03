"""Cross-service events on Redis (ADR-006). The auth service publishes
`events:user.deleted` when an account is deleted; this service then removes
everything in that workspace: rows (cascade) and stored files.
"""

import asyncio
import json
import uuid

from sqlalchemy import delete, select

from app.db.models import Dataset
from app.log import log
from app.pipeline import Context

USER_DELETED = "events:user.deleted"


async def purge_workspace(ctx: Context, workspace_id: uuid.UUID) -> int:
    async with ctx.sessionmaker() as session:
        ids = list(
            await session.scalars(select(Dataset.id).where(Dataset.workspace_id == workspace_id))
        )
        await session.execute(delete(Dataset).where(Dataset.workspace_id == workspace_id))
        await session.commit()
    storage = ctx.storage
    for bucket, prefix in (
        (storage.raw_bucket, f"raw/{workspace_id}/"),
        (storage.parquet_bucket, f"parquet/{workspace_id}/"),
    ):
        await storage.delete_prefix(bucket, prefix)
        storage.evict(prefix)
    return len(ids)


async def listen_for_deleted_users(ctx: Context) -> None:
    """Runs for the worker's lifetime; reconnects if Redis drops."""
    while True:
        try:
            pubsub = ctx.redis.pubsub()
            await pubsub.subscribe(USER_DELETED)
            async for message in pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message["data"])
                    workspace_id = uuid.UUID(payload["workspaceId"])
                except (ValueError, KeyError, TypeError):
                    log.warning("user_deleted_ignored", data=str(message.get("data"))[:200])
                    continue
                count = await purge_workspace(ctx, workspace_id)
                log.info("workspace_purged", workspace_id=str(workspace_id), datasets=count)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("user_deleted_listener_error")
            await asyncio.sleep(2)
