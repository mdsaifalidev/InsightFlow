"""Schema `analytics`, owned by this service (ADR-006; PRD §8).

There are no foreign keys into the auth schema: `workspace_id` comes from the
verified token and every query is scoped by it.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Integer, MetaData, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

SCHEMA = "analytics"


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (Index("datasets_workspace_created_idx", "workspace_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    row_count: Mapped[int | None] = mapped_column(Integer)
    column_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="queued")
    error_message: Mapped[str | None] = mapped_column(Text)
    # Uploads live in the raw bucket; bundled samples are read from disk.
    raw_object_key: Mapped[str | None] = mapped_column(Text)
    sample_key: Mapped[str | None] = mapped_column(Text)
    parquet_object_key: Mapped[str | None] = mapped_column(Text)
    date_column: Mapped[str | None] = mapped_column(Text)
    # Latest ingest job, so lists can subscribe to progress.
    job_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DatasetColumn(Base):
    __tablename__ = "dataset_columns"
    __table_args__ = (Index("dataset_columns_dataset_idx", "dataset_id", "position"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    original_name: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    inferred_type: Mapped[str] = mapped_column(Text, nullable=False)
    override_type: Mapped[str | None] = mapped_column(Text)
    profile: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (Index("jobs_dataset_idx", "dataset_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # ingest | insight
    stage: Mapped[str] = mapped_column(Text, nullable=False, default="queued")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    # SSE event id: bumped on every published event, replayed on reconnect.
    seq: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Widget(Base):
    __tablename__ = "widgets"
    __table_args__ = (Index("widgets_dataset_idx", "dataset_id", "position"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    kind: Mapped[str] = mapped_column(Text, nullable=False)  # auto | custom
    spec: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Insight(Base):
    __tablename__ = "insights"
    __table_args__ = (Index("insights_dataset_created_idx", "dataset_id", "created_at"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    findings: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    next_questions: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    facts: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    anomalies: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
