"""All configuration comes from the environment, validated once at startup."""

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Literal, Self

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parent.parent

# Dev conveniences that must never reach production.
DEV_DEFAULTS = {
    "jwks_url": "http://localhost:4000/api/auth/.well-known/jwks.json",
    "web_origin": "http://localhost:3000",
    "s3_endpoint": "http://localhost:9000",
    "s3_access_key": "rustfsadmin",
    "s3_secret_key": "rustfsadmin",
}


class Settings(BaseSettings):
    # Native dev defaults; real environment variables take precedence, and the
    # files are skipped in production so a deployment can't inherit localhost.
    # .env.local is untracked and wins over .env.development: secrets like an
    # LLM key belong there, never in the committed template.
    model_config = SettingsConfigDict(
        extra="ignore",
        env_file=(
            None
            if os.environ.get("ENV") == "production"
            else (ROOT / ".env.development", ROOT / ".env.local")
        ),
    )

    env: Literal["development", "test", "production"] = "development"
    log_level: str = "info"

    database_url: str
    redis_url: str = "redis://localhost:6379/0"

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        if isinstance(v, str):
            v = re.sub(r"[?&]channel_binding=[^&]*", "", v)
            v = v.replace("sslmode=", "ssl=").replace("?&", "?").rstrip("?&")
        return v

    # Access tokens come from the auth service; verified locally via its JWKS (ADR-007).
    jwks_url: str = "http://localhost:4000/api/auth/.well-known/jwks.json"
    jwt_issuer: str = "insightflow-auth"
    jwt_audience: str = "insightflow"

    web_origin: str = "http://localhost:3000"

    s3_endpoint: str | None = "http://localhost:9000"
    s3_region: str = "us-east-1"
    s3_access_key: str = "rustfsadmin"
    s3_secret_key: str = "rustfsadmin"
    s3_bucket_raw: str = "insightflow-raw"
    s3_bucket_parquet: str = "insightflow-parquet"

    # Parquet files are cached here; object storage stays the source of truth (ADR-011).
    cache_dir: Path = Path(".cache")
    samples_dir: Path = ROOT / "samples"

    max_upload_bytes: int = 100 * 1024 * 1024
    # mock is the default everywhere (dev, tests, CI); gemini needs a key.
    llm_provider: Literal["mock", "gemini"] = "mock"
    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-2.5-flash"
    # The brief is written inside a request on the lazy path, so a hanging API
    # must not hang the request (app/llm/gemini.py).
    gemini_timeout_s: float = 20.0
    insight_regenerations_per_hour: int = 5

    @model_validator(mode="after")
    def _require_provider_credentials(self) -> Self:
        """Fail at boot, not at the first upload."""
        if self.llm_provider == "gemini" and not self.gemini_api_key:
            raise ValueError("LLM_PROVIDER=gemini requires GEMINI_API_KEY")
        return self

    @model_validator(mode="after")
    def _reject_dev_defaults_in_production(self) -> Self:
        """Fail at boot rather than quietly talking to localhost or RustFS."""
        if self.env != "production":
            return self
        unset = sorted(name for name, value in DEV_DEFAULTS.items() if getattr(self, name) == value)
        if unset:
            raise ValueError(
                "These still hold their development defaults: "
                + ", ".join(name.upper() for name in unset)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
