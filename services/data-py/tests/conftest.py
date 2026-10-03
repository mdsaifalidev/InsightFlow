"""Test harness: real Postgres 17 and Redis 7 (Testcontainers), S3 via moto,
and a local RSA key whose JWKS stands in for the auth service.
"""

import os
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any

import boto3
import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from moto import mock_aws
from testcontainers.community.postgres import PostgresContainer
from testcontainers.core.container import DockerContainer
from testcontainers.core.wait_strategies import LogMessageWaitStrategy

# A developer's untracked .env.local may select a real provider; tests must
# never call one (it would cost money and make the golden briefs random).
# A real environment variable beats every dotenv file in pydantic-settings.
os.environ["LLM_PROVIDER"] = "mock"

KID = "test-key"
ISSUER = "insightflow-auth"
AUDIENCE = "insightflow"
PRIVATE_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def jwks() -> dict[str, Any]:
    jwk = jwt.algorithms.RSAAlgorithm.to_jwk(PRIVATE_KEY.public_key(), as_dict=True)
    return {"keys": [{**jwk, "kid": KID, "alg": "RS256", "use": "sig"}]}


def make_token(workspace_id: uuid.UUID, **overrides: Any) -> str:
    claims: dict[str, Any] = {
        "sub": str(uuid.uuid4()),
        "wid": str(workspace_id),
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": int(time.time()),
        "exp": int(time.time()) + 900,
        **overrides,
    }
    return jwt.encode(claims, PRIVATE_KEY, algorithm="RS256", headers={"kid": KID})


@pytest.fixture(scope="session")
def containers(tmp_path_factory: pytest.TempPathFactory) -> Iterator[None]:
    postgres = PostgresContainer("postgres:17-alpine", driver="asyncpg")
    redis = (
        DockerContainer("redis:7-alpine")
        .with_exposed_ports(6379)
        .waiting_for(LogMessageWaitStrategy("Ready to accept connections"))
    )
    with postgres, redis:
        os.environ.update(
            {
                "ENV": "test",
                "LOG_LEVEL": "warning",
                "DATABASE_URL": postgres.get_connection_url(),
                "REDIS_URL": (
                    f"redis://{redis.get_container_host_ip()}:{redis.get_exposed_port(6379)}/0"
                ),
                "S3_ENDPOINT": "",
                "S3_ACCESS_KEY": "test",
                "S3_SECRET_KEY": "test",
                "CACHE_DIR": str(tmp_path_factory.mktemp("cache")),
                "JWKS_URL": "http://auth.test/api/auth/.well-known/jwks.json",
            }
        )
        from alembic.config import Config

        from alembic import command

        config = Config(str(Path(__file__).parent.parent / "alembic.ini"))
        config.attributes["database_url"] = os.environ["DATABASE_URL"]
        command.upgrade(config, "head")
        yield


@pytest.fixture(scope="session")
def s3(containers: None) -> Iterator[Any]:
    with mock_aws():
        client = boto3.client("s3", region_name="us-east-1")
        client.create_bucket(Bucket="insightflow-raw")
        client.create_bucket(Bucket="insightflow-parquet")
        yield client


@pytest.fixture(scope="session")
async def app(s3: Any) -> AsyncIterator[Any]:
    from app.auth import JwksCache
    from app.config import get_settings
    from app.main import create_app

    transport = httpx.MockTransport(lambda _: httpx.Response(200, json=jwks()))
    settings = get_settings()
    application = create_app(
        settings, JwksCache(settings.jwks_url, httpx.AsyncClient(transport=transport))
    )
    async with application.router.lifespan_context(application):
        yield application


@pytest.fixture
async def client(app: Any) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://data.test"
    ) as http:
        yield http


class Api:
    """An HTTP client signed in to one workspace."""

    def __init__(self, http: httpx.AsyncClient, workspace_id: uuid.UUID, **claims: Any) -> None:
        self.http = http
        self.workspace_id = workspace_id
        self.headers = {"Authorization": f"Bearer {make_token(workspace_id, **claims)}"}

    async def request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        return await self.http.request(method, url, headers=self.headers, **kwargs)

    async def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("GET", url, **kwargs)

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        return await self.request("POST", url, **kwargs)


@pytest.fixture
def api(client: httpx.AsyncClient) -> Api:
    return Api(client, uuid.uuid4())


@pytest.fixture
def other_api(client: httpx.AsyncClient) -> Api:
    return Api(client, uuid.uuid4())


async def run_jobs(app: Any) -> None:
    """Runs every queued ARQ job to completion (a burst worker)."""
    from arq.worker import Worker

    from app.worker import WorkerSettings

    worker = Worker(
        functions=WorkerSettings.functions,
        redis_pool=app.state.arq,
        burst=True,
        on_startup=WorkerSettings.on_startup,
        on_shutdown=WorkerSettings.on_shutdown,
        handle_signals=False,
        poll_delay=0.05,
        max_tries=WorkerSettings.max_tries,
    )
    try:
        await worker.main()
    finally:
        await WorkerSettings.on_shutdown(worker.ctx)
