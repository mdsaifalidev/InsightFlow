"""Streams a multipart upload straight into object storage (PRD F2).

The request body is parsed as it arrives and the file part is written to S3
in 8 MB multipart chunks, so nothing large is buffered and only bookkeeping
is left when the last byte lands (202 in < 1s after the upload completes).
Validation matches apps/web/mocks/handlers/datasets.ts: missing file → 422,
wrong type → 415, empty → 422, too large → 413.
"""

import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from python_multipart import MultipartParser
from python_multipart.multipart import parse_options_header

from app.errors import Problem
from app.storage import Storage

if TYPE_CHECKING:
    from mypy_boto3_s3.type_defs import CompletedPartTypeDef

PART_SIZE = 8 * 1024 * 1024
CSV_TYPES = {"text/csv", "text/plain", "application/csv", "application/vnd.ms-excel"}
XLSX_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
}
GENERIC_TYPES = {"", "application/octet-stream"}


def missing_file() -> Problem:
    return Problem(
        422, "Validation failed", "Choose a file to upload.", {"file": "Choose a file to upload."}
    )


def file_type_of(filename: str, content_type: str) -> str:
    """ "csv" or "xlsx", or a 415 for anything else."""
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    allowed = CSV_TYPES if extension == "csv" else XLSX_TYPES
    if extension not in ("csv", "xlsx") or content_type not in allowed | GENERIC_TYPES:
        raise Problem(415, "Unsupported file type", "Upload a .csv or .xlsx file.")
    return extension


@dataclass
class _Part:
    headers: dict[str, bytes] = field(default_factory=dict)
    name: str = ""
    filename: str | None = None
    content_type: str = ""


@dataclass
class ReceivedUpload:
    filename: str
    file_type: str
    size: int
    name: str


class S3Writer:
    """Writes one object in multipart chunks (or a single put when small)."""

    def __init__(self, storage: Storage, bucket: str, key: str) -> None:
        self.storage, self.bucket, self.key = storage, bucket, key
        self.upload_id: str | None = None
        self.parts: list[CompletedPartTypeDef] = []
        self.buffer = bytearray()

    async def _run(self, fn: Any, **kwargs: Any) -> Any:
        return await asyncio.to_thread(fn, Bucket=self.bucket, Key=self.key, **kwargs)

    async def write(self, data: bytes) -> None:
        self.buffer += data
        while len(self.buffer) >= PART_SIZE:
            chunk = bytes(self.buffer[:PART_SIZE])
            del self.buffer[:PART_SIZE]
            await self._upload_part(chunk)

    async def _upload_part(self, chunk: bytes) -> None:
        client = self.storage.client
        if self.upload_id is None:
            created = await self._run(client.create_multipart_upload)
            self.upload_id = created["UploadId"]
        number = len(self.parts) + 1
        result = await self._run(
            client.upload_part, UploadId=self.upload_id, PartNumber=number, Body=chunk
        )
        self.parts.append({"ETag": result["ETag"], "PartNumber": number})

    async def close(self) -> None:
        client = self.storage.client
        if self.upload_id is None:
            await self._run(client.put_object, Body=bytes(self.buffer))
            return
        if self.buffer:
            await self._upload_part(bytes(self.buffer))
            self.buffer.clear()
        await self._run(
            client.complete_multipart_upload,
            UploadId=self.upload_id,
            MultipartUpload={"Parts": self.parts},
        )

    async def abort(self) -> None:
        if self.upload_id is not None:
            await self._run(self.storage.client.abort_multipart_upload, UploadId=self.upload_id)
            self.upload_id = None


async def receive_upload(
    body: AsyncIterator[bytes],
    content_type_header: str,
    storage: Storage,
    object_key: str,
    max_bytes: int,
) -> ReceivedUpload:
    """Parses the multipart body and streams the `file` part to `object_key`
    (without its extension; the caller's key must end in the returned type)."""
    kind, options = parse_options_header(content_type_header)
    boundary = options.get(b"boundary")
    if kind != b"multipart/form-data" or not boundary:
        raise missing_file()

    current = _Part()
    header_field = bytearray()
    header_value = bytearray()
    pending: list[bytes] = []  # file bytes parsed from the latest chunk
    fields: dict[str, bytearray] = {}
    found: dict[str, Any] = {}

    def on_part_begin() -> None:
        nonlocal current
        current = _Part()

    def on_header_field(data: bytes, start: int, end: int) -> None:
        header_field.extend(data[start:end])

    def on_header_value(data: bytes, start: int, end: int) -> None:
        header_value.extend(data[start:end])

    def on_header_end() -> None:
        current.headers[header_field.decode("latin-1").lower()] = bytes(header_value)
        header_field.clear()
        header_value.clear()

    def on_headers_finished() -> None:
        _, disposition = parse_options_header(current.headers.get("content-disposition", b""))
        current.name = disposition.get(b"name", b"").decode()
        filename = disposition.get(b"filename")
        current.filename = filename.decode() if filename is not None else None
        ctype, _ = parse_options_header(current.headers.get("content-type", b""))
        current.content_type = ctype.decode().lower()
        if current.name == "file" and current.filename and "file" not in found:
            found["file"] = current

    def on_part_data(data: bytes, start: int, end: int) -> None:
        if found.get("file") is current:
            pending.append(data[start:end])
        elif current.filename is None:
            fields.setdefault(current.name, bytearray()).extend(data[start:end][:4096])

    parser = MultipartParser(
        boundary,
        {
            "on_part_begin": on_part_begin,
            "on_header_field": on_header_field,
            "on_header_value": on_header_value,
            "on_header_end": on_header_end,
            "on_headers_finished": on_headers_finished,
            "on_part_data": on_part_data,
        },
    )

    writer = S3Writer(storage, storage.raw_bucket, object_key)
    size = 0
    file_type: str | None = None
    try:
        async for chunk in body:
            parser.write(chunk)
            if "file" in found and file_type is None:
                part: _Part = found["file"]
                file_type = file_type_of(part.filename or "", part.content_type)
                writer.key = f"{object_key}.{file_type}"
            for data in pending:
                size += len(data)
                if size > max_bytes:
                    limit = max_bytes // (1024 * 1024)
                    raise Problem(413, "File too large", f"Upload a file up to {limit} MB.")
                await writer.write(data)
            pending.clear()
        parser.finalize()
        if "file" not in found or file_type is None:
            raise missing_file()
        if size == 0:
            raise Problem(
                422, "Validation failed", "The file is empty.", {"file": "The file is empty."}
            )
        await writer.close()
    except BaseException:
        await writer.abort()
        raise
    part = found["file"]
    return ReceivedUpload(
        filename=part.filename or "",
        file_type=file_type,
        size=size,
        name=fields.get("name", bytearray()).decode("utf-8", "replace"),
    )
