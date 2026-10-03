"""Dashboards and briefs built from a dataset's typed data, called by the
pipeline and after column type overrides.
"""

import asyncio
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.datasets import columns_of, date_column_of, effective_type
from app.db.models import Dataset, DatasetColumn, Insight, Widget
from app.engine.dashboard import auto_widget_specs
from app.engine.facts import build_facts
from app.engine.measures import ColumnInfo
from app.frames import load_frame
from app.llm.brief import generate_brief, get_provider
from app.serialize import iso
from app.storage import Storage


def column_infos(columns: list[DatasetColumn]) -> list[ColumnInfo]:
    """Engine view of the columns, with type overrides applied."""
    return [ColumnInfo(c.name, effective_type(c), c.position, c.profile) for c in columns]


def widget_json(widget: Widget) -> dict[str, Any]:
    return {
        "id": str(widget.id),
        "datasetId": str(widget.dataset_id),
        "kind": widget.kind,
        "spec": widget.spec,
        "position": widget.position,
        "createdAt": iso(widget.created_at),
    }


async def widgets_of(session: AsyncSession, dataset: Dataset) -> list[Widget]:
    result = await session.scalars(
        select(Widget)
        .where(Widget.dataset_id == dataset.id)
        .order_by(Widget.position, Widget.created_at)
    )
    return list(result)


async def build_dashboard(
    session: AsyncSession, dataset: Dataset, storage: Storage, settings: Settings
) -> None:
    """Fresh auto charts; custom charts keep their place after them."""
    columns = await columns_of(session, dataset.id)
    specs = auto_widget_specs(column_infos(columns), date_column_of(columns))
    custom = [w for w in await widgets_of(session, dataset) if w.kind == "custom"]
    await session.execute(
        delete(Widget).where(Widget.dataset_id == dataset.id, Widget.kind == "auto")
    )
    session.add_all(
        Widget(dataset_id=dataset.id, kind="auto", spec=spec, position=position)
        for position, spec in enumerate(specs)
    )
    for offset, widget in enumerate(custom):
        widget.position = len(specs) + offset
    await session.commit()


def insight_json(insight: Insight) -> dict[str, Any]:
    return {
        "id": str(insight.id),
        "datasetId": str(insight.dataset_id),
        "summary": insight.summary,
        "findings": insight.findings,
        "nextQuestions": insight.next_questions,
        "facts": insight.facts,
        "anomalies": insight.anomalies,
        "provider": insight.provider,
        "model": insight.model,
        "createdAt": iso(insight.created_at),
    }


async def generate_insight(
    session: AsyncSession, dataset: Dataset, storage: Storage, settings: Settings
) -> Insight:
    """Facts from Polars, text from the LLM provider, validated (ADR-010)."""
    columns = await columns_of(session, dataset.id)
    widgets = [
        {"id": str(w.id), "kind": w.kind, "spec": w.spec}
        for w in await widgets_of(session, dataset)
    ]
    frame = await load_frame(dataset, storage)
    fact_set = await asyncio.to_thread(
        build_facts, frame, column_infos(columns), date_column_of(columns), widgets
    )
    brief = await generate_brief(fact_set, get_provider(settings))
    insight = Insight(
        dataset_id=dataset.id,
        summary=brief.summary,
        findings=brief.findings,
        next_questions=brief.next_questions,
        facts=fact_set.facts,
        anomalies=fact_set.anomalies,
        provider=brief.provider,
        model=brief.model,
        input_tokens=brief.input_tokens,
        output_tokens=brief.output_tokens,
    )
    session.add(insight)
    await session.commit()
    await session.refresh(insight)
    return insight


async def latest_insight(session: AsyncSession, dataset: Dataset) -> Insight | None:
    result: Insight | None = await session.scalar(
        select(Insight)
        .where(Insight.dataset_id == dataset.id)
        .order_by(Insight.created_at.desc())
        .limit(1)
    )
    return result
