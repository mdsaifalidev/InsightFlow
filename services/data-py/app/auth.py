"""Access-token verification against the auth service's JWKS (ADR-007).

Keys are fetched once and cached; an unknown `kid` (key rotation) triggers a
refetch, at most every few seconds. No per-request calls to the auth service.
"""

import asyncio
import time
import uuid
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, Request

from app.config import Settings
from app.errors import Problem

REFETCH_INTERVAL_SECONDS = 5.0


@dataclass(frozen=True)
class Principal:
    user_id: str
    workspace_id: uuid.UUID


class JwksCache:
    def __init__(self, url: str, client: httpx.AsyncClient | None = None) -> None:
        self._url = url
        self._client = client or httpx.AsyncClient(timeout=5.0)
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched_at = 0.0
        self._lock = asyncio.Lock()

    async def _refresh(self) -> None:
        response = await self._client.get(self._url)
        response.raise_for_status()
        keys = jwt.PyJWKSet.from_dict(response.json()).keys
        self._keys = {key.key_id: key for key in keys if key.key_id}
        self._fetched_at = time.monotonic()

    async def key(self, kid: str) -> jwt.PyJWK | None:
        if kid in self._keys:
            return self._keys[kid]
        async with self._lock:
            stale = time.monotonic() - self._fetched_at > REFETCH_INTERVAL_SECONDS
            if kid not in self._keys and (stale or not self._keys):
                await self._refresh()
        return self._keys.get(kid)

    async def aclose(self) -> None:
        await self._client.aclose()


def _unauthorized() -> Problem:
    return Problem(401, "Unauthorized", "Your session has expired. Sign in again.")


async def verify_token(token: str, jwks: JwksCache, settings: Settings) -> Principal:
    try:
        kid = jwt.get_unverified_header(token).get("kid")
        key = await jwks.key(kid) if isinstance(kid, str) else None
        if key is None:
            raise _unauthorized()
        claims: dict[str, Any] = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            options={"require": ["exp", "sub", "iss", "aud"]},
        )
        return Principal(
            user_id=str(claims["sub"]),
            workspace_id=uuid.UUID(str(claims["wid"])),
        )
    except (jwt.PyJWTError, KeyError, ValueError, httpx.HTTPError) as error:
        raise _unauthorized() from error


async def current_principal(request: Request) -> Principal:
    header = request.headers.get("authorization", "")
    if not header.startswith("Bearer "):
        raise _unauthorized()
    return await verify_token(header[7:], request.app.state.jwks, request.app.state.settings)


CurrentPrincipal = Annotated[Principal, Depends(current_principal)]
