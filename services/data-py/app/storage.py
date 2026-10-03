"""Object storage (S3 API: RustFS locally, S3/R2 in production; ADR-012).

Raw uploads and Parquet files live in two buckets. Parquet is also cached on
local disk for Polars scans; the bucket stays the source of truth (ADR-011).
boto3 is synchronous, so calls run in a worker thread.
"""

import asyncio
import shutil
import uuid
from pathlib import Path
from typing import TYPE_CHECKING, BinaryIO

import boto3
from botocore.config import Config

from app.config import Settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client
    from mypy_boto3_s3.type_defs import ObjectIdentifierTypeDef


def raw_key(workspace_id: uuid.UUID, dataset_id: uuid.UUID, file_type: str) -> str:
    return f"raw/{workspace_id}/{dataset_id}.{file_type}"


def parquet_key(workspace_id: uuid.UUID, dataset_id: uuid.UUID) -> str:
    # A fresh suffix per write, so a type override never serves a stale cache.
    return f"parquet/{workspace_id}/{dataset_id}/{uuid.uuid4().hex[:12]}.parquet"


class Storage:
    def __init__(self, settings: Settings) -> None:
        self.raw_bucket = settings.s3_bucket_raw
        self.parquet_bucket = settings.s3_bucket_parquet
        self.cache_dir = settings.cache_dir
        self.client: S3Client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint or None,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            config=Config(
                s3={"addressing_style": "path"},
                # RustFS, like MinIO, doesn't implement the newer default checksums.
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
                retries={"max_attempts": 3, "mode": "standard"},
            ),
        )

    async def upload_fileobj(self, bucket: str, key: str, fileobj: BinaryIO) -> None:
        await asyncio.to_thread(self.client.upload_fileobj, fileobj, bucket, key)

    async def upload_file(self, bucket: str, key: str, path: Path) -> None:
        await asyncio.to_thread(self.client.upload_file, str(path), bucket, key)

    async def download(self, bucket: str, key: str, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        await asyncio.to_thread(self.client.download_file, bucket, key, str(tmp))
        tmp.replace(path)
        return path

    async def delete(self, bucket: str, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=bucket, Key=key)

    async def delete_prefix(self, bucket: str, prefix: str) -> None:
        def run() -> None:
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                objects: list[ObjectIdentifierTypeDef] = [
                    {"Key": o["Key"]} for o in page.get("Contents", []) if "Key" in o
                ]
                if objects:
                    self.client.delete_objects(Bucket=bucket, Delete={"Objects": objects})

        await asyncio.to_thread(run)

    def cache_path(self, key: str) -> Path:
        return self.cache_dir / key

    async def parquet_path(self, key: str) -> Path:
        """Local path of a Parquet object, downloading it on a cache miss."""
        path = self.cache_path(key)
        if not path.exists():
            await self.download(self.parquet_bucket, key, path)
        return path

    def evict(self, prefix: str) -> None:
        shutil.rmtree(self.cache_dir / prefix, ignore_errors=True)
