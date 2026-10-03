"""Configuration guards: production must not inherit development defaults."""

import os

import pytest
from pydantic import ValidationError

from app.config import Settings

# conftest exports real service URLs for the container fixtures, and a real
# environment variable beats .env.development: clear them so these tests see
# the defaults they are about. LLM_PROVIDER stays pinned (see conftest).
AMBIENT = (
    "ENV",
    "JWKS_URL",
    "WEB_ORIGIN",
    "DATABASE_URL",
    "REDIS_URL",
    "S3_ENDPOINT",
    "S3_REGION",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
    "S3_BUCKET_RAW",
    "S3_BUCKET_PARQUET",
    "CACHE_DIR",
    "SAMPLES_DIR",
)


@pytest.fixture(autouse=True)
def _without_ambient_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in AMBIENT:
        monkeypatch.delenv(name, raising=False)


PRODUCTION = {
    "env": "production",
    "database_url": "postgresql+asyncpg://user:pw@db.example.com/insightflow",
}
REAL_VALUES = {
    "jwks_url": "https://auth.example.com/api/auth/.well-known/jwks.json",
    "web_origin": "https://app.example.com",
    "s3_endpoint": "https://account.r2.cloudflarestorage.com",
    "s3_access_key": "real-access-key",
    "s3_secret_key": "real-secret-key",
}


def test_development_keeps_the_local_defaults() -> None:
    settings = Settings(database_url=PRODUCTION["database_url"])
    assert settings.s3_access_key == "rustfsadmin"
    assert "localhost" in settings.jwks_url


def test_tests_never_reach_a_live_llm_provider() -> None:
    """A developer's untracked .env.local must not make pytest call an API."""
    assert os.environ["LLM_PROVIDER"] == "mock"  # pinned in conftest.py
    assert Settings(database_url=PRODUCTION["database_url"]).llm_provider == "mock"


def test_production_refuses_development_defaults() -> None:
    with pytest.raises(ValidationError) as error:
        Settings(**PRODUCTION)
    message = str(error.value)
    for name in ("JWKS_URL", "WEB_ORIGIN", "S3_ACCESS_KEY", "S3_SECRET_KEY"):
        assert name in message


def test_production_accepts_real_values() -> None:
    settings = Settings(**PRODUCTION, **REAL_VALUES)
    assert settings.env == "production"
    assert settings.web_origin == "https://app.example.com"
