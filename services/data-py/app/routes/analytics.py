"""Dashboard, queries, table rows, filter values and chart CRUD (PRD §9;
mirrors apps/web/mocks/handlers/{dashboard,widgets}.ts).

Engine work is CPU-bound Polars, so it runs in a worker thread.
"""

import asyncio
import json
import uuid
from typing import Annotated, Any

import polars as pl
from fastapi import APIRouter, Body, Query, Request, Response
from sqlalchemy import func, select

from app.analytics import column_infos, widget_json, widgets_of
from app.auth import CurrentPrincipal, Principal
from app.datasets import columns_of, date_column_of, effective_type
from app.db.models import Dataset, DatasetColumn, Widget
from app.db.session import Session
from app.engine.dashboard import spec as clean_fields
from app.engine.kpis import compute_kpis
from app.engine.query import apply_filters, rows_json, run_widget, sort_rows
from app.engine.values import display_string
from app.errors import Problem
from app.frames import load_frame
from app.routes.datasets import find_dataset
from app.schemas import (
    UNSET,
    DashboardResponse,
    FilterValuesResponse,
    QueryRequest,
    QueryResponse,
    RowsResponse,
    WidgetRequest,
    problems,
)
from app.schemas import Widget as WidgetModel

router = APIRouter(prefix="/api/data/datasets")

PAGE_SIZES = (25, 50, 100, 250)
CHART_TYPES = ("line", "area", "bar", "donut", "histogram")
AGGREGATIONS = ("sum", "avg", "count", "min", "max", "count_distinct")
X_TYPES = {
    "line": ("datetime",),
    "area": ("datetime",),
    "bar": ("categorical", "boolean", "text"),
    "donut": ("categorical", "boolean"),
    "histogram": ("numeric",),
}
Json = dict[str, Any]


async def ready_dataset(session: Session, principal: Principal, dataset_id: str) -> Dataset:
    dataset = await find_dataset(session, principal, dataset_id)
    if dataset.status != "ready":
        raise Problem(409, "Dataset not ready", "This dataset is still processing.")
    return dataset


def sanitize_filters(columns: list[DatasetColumn], filters: Any) -> Json:
    """Drops filters on unknown columns so stale URLs can't break a page."""
    filters = filters if isinstance(filters, dict) else {}
    names = {c.name for c in columns}
    date_column = date_column_of(columns)
    date_range = filters.get("dateRange") if isinstance(filters.get("dateRange"), dict) else None
    clean: Json = {}
    if date_range and date_column and (date_range.get("from") or date_range.get("to")):
        clean["dateRange"] = {
            "column": date_column,
            "from": date_range.get("from"),
            "to": date_range.get("to"),
        }
    wheres = filters.get("where") if isinstance(filters.get("where"), list) else []
    clean["where"] = [
        w for w in wheres if isinstance(w, dict) and w.get("column") in names and w.get("values")
    ]
    return clean


@router.get(
    "/{dataset_id}/dashboard",
    response_model=DashboardResponse,
    responses=problems(401, 404, 409),
    **UNSET,
)
async def dashboard(
    request: Request, session: Session, principal: CurrentPrincipal, dataset_id: str
) -> Json:
    dataset = await ready_dataset(session, principal, dataset_id)
    columns = await columns_of(session, dataset.id)
    widgets = await widgets_of(session, dataset)
    frame = await load_frame(dataset, request.app.state.storage)
    date_column = date_column_of(columns)
    kpis = await asyncio.to_thread(compute_kpis, frame, column_infos(columns), date_column)
    return {"kpis": kpis, "widgets": [widget_json(w) for w in widgets], "dateColumn": date_column}


@router.post(
    "/{dataset_id}/query",
    response_model=QueryResponse,
    responses=problems(401, 404, 409, 422),
    **UNSET,
)
async def query(
    request: Request,
    session: Session,
    principal: CurrentPrincipal,
    dataset_id: str,
    body: Annotated[QueryRequest, Body()],
) -> Json:
    dataset = await ready_dataset(session, principal, dataset_id)
    columns = await columns_of(session, dataset.id)
    payload = body.model_dump(by_alias=True, exclude_none=True)
    filters = sanitize_filters(columns, payload.get("filters"))
    frame = await load_frame(dataset, request.app.state.storage)
    widgets = payload.get("widgets") or []

    def run() -> Json:
        filtered = apply_filters(frame, filters)
        kpis = (
            compute_kpis(frame, column_infos(columns), date_column_of(columns), filters)
            if payload.get("kpis")
            else []
        )
        results = []
        for widget in widgets:
            try:
                results.append(run_widget(str(widget.get("id")), filtered, widget["spec"]))
            except (KeyError, TypeError, pl.exceptions.PolarsError) as error:
                raise Problem(
                    422, "Invalid chart", "Check the chart settings.", {"spec": str(error)}
                ) from error
        return {"kpis": kpis, "results": results}

    return await asyncio.to_thread(run)


@router.get(
    "/{dataset_id}/rows",
    response_model=RowsResponse,
    responses=problems(400, 401, 404, 409),
    **UNSET,
)
async def rows(
    request: Request,
    session: Session,
    principal: CurrentPrincipal,
    dataset_id: str,
    page: str = "1",
    page_size: Annotated[str, Query(alias="pageSize")] = "50",
    sort: str = "",
    filters: str | None = None,
) -> Json:
    dataset = await ready_dataset(session, principal, dataset_id)
    columns = await columns_of(session, dataset.id)
    names = [c.name for c in columns]
    page_number = max(1, int(page) if page.isdigit() else 1)
    size = int(page_size) if page_size.isdigit() and int(page_size) in PAGE_SIZES else 50
    try:
        parsed = json.loads(filters) if filters else None
    except json.JSONDecodeError as error:
        raise Problem(400, "Invalid filters", "The filters parameter must be JSON.") from error
    clean = sanitize_filters(columns, parsed)
    frame = await load_frame(dataset, request.app.state.storage)
    sort_column, _, direction = sort.partition(":")

    def run() -> Json:
        selected = apply_filters(frame, clean)
        if sort_column in names:
            selected = sort_rows(selected, sort_column, "desc" if direction == "desc" else "asc")
        window = selected.slice((page_number - 1) * size, size)
        return {
            "columns": names,
            "rows": rows_json(window.select(names)),
            "page": page_number,
            "pageSize": size,
            "total": selected.height,
        }

    return await asyncio.to_thread(run)


@router.get(
    "/{dataset_id}/filters/{column}/values",
    response_model=FilterValuesResponse,
    responses=problems(401, 404, 409),
    **UNSET,
)
async def filter_values(
    request: Request,
    session: Session,
    principal: CurrentPrincipal,
    dataset_id: str,
    column: str,
    q: str = "",
) -> Json:
    dataset = await ready_dataset(session, principal, dataset_id)
    if column not in {c.name for c in await columns_of(session, dataset.id)}:
        raise Problem(404, "Column not found")
    frame = await load_frame(dataset, request.app.state.storage)
    needle = q.lower()

    def run() -> list[Json]:
        values = frame.select(display_string(pl.col(column), frame.schema[column]).alias("value"))
        values = values.filter(pl.col("value").is_not_null())
        if needle:
            values = values.filter(
                pl.col("value").str.to_lowercase().str.contains(needle, literal=True)
            )
        counts = values.group_by("value").agg(pl.len().alias("count"))
        return counts.sort(["count", "value"], descending=[True, False]).head(100).to_dicts()

    return {"column": column, "values": await asyncio.to_thread(run)}


# ---------- Widgets ----------


def validate_spec(spec: Any, columns: list[DatasetColumn]) -> dict[str, str]:
    """Server-side spec validation; errors are keyed by spec field."""
    if not isinstance(spec, dict):
        return {"spec": "Missing chart spec."}
    errors: dict[str, str] = {}
    types = {c.name: effective_type(c) for c in columns}
    if not str(spec.get("title") or "").strip():
        errors["title"] = "Give the chart a title."
    chart = spec.get("chartType")
    if chart not in CHART_TYPES:
        errors["chartType"] = "Choose a chart type."
        return errors
    x = spec.get("x")
    if not x or x not in types:
        errors["x"] = "Choose a column for the x axis."
    elif types[x] not in X_TYPES[chart]:
        errors["x"] = "This column can't be used on this chart's x axis."
    aggregation = spec.get("aggregation")
    if aggregation not in AGGREGATIONS:
        errors["aggregation"] = "Choose how to summarize values."
    elif aggregation != "count" and chart != "histogram":
        y_type = types.get(spec.get("y") or "")
        if not y_type:
            errors["y"] = "Choose a value column."
        elif aggregation != "count_distinct" and y_type not in ("numeric", "boolean"):
            errors["y"] = "Only number columns can be summed or averaged."
    split = spec.get("split")
    if split:
        if split not in types:
            errors["split"] = "Unknown column."
        elif chart in ("donut", "histogram"):
            errors["split"] = "This chart type can't be split into series."
    return errors


def clean_spec(spec: Json) -> Json:
    chart = spec["chartType"]
    counted = spec["aggregation"] == "count" or chart == "histogram"
    return clean_fields(
        chartType=chart,
        title=str(spec["title"]).strip(),
        x=spec["x"],
        y=None if counted else spec.get("y"),
        aggregation="count" if chart == "histogram" else spec["aggregation"],
        split=spec.get("split") or None,
        timeGrain=(spec.get("timeGrain") or "month") if chart in ("line", "area") else None,
        limit=spec.get("limit"),
    )


async def checked_spec(session: Session, dataset: Dataset, body: WidgetRequest) -> Json:
    spec = body.spec
    errors = validate_spec(spec, await columns_of(session, dataset.id))
    if errors:
        raise Problem(422, "Validation failed", "Check the chart settings.", errors)
    return clean_spec(spec)  # type: ignore[arg-type]


async def find_widget(session: Session, dataset: Dataset, widget_id: str) -> Widget:
    try:
        key = uuid.UUID(widget_id)
    except ValueError:
        raise Problem(404, "Chart not found") from None
    widget = await session.scalar(
        select(Widget).where(Widget.id == key, Widget.dataset_id == dataset.id)
    )
    if widget is None:
        raise Problem(404, "Chart not found")
    return widget


@router.get(
    "/{dataset_id}/widgets",
    response_model=list[WidgetModel],
    responses=problems(401, 404),
    **UNSET,
)
async def list_widgets(
    session: Session, principal: CurrentPrincipal, dataset_id: str
) -> list[Json]:
    dataset = await find_dataset(session, principal, dataset_id)
    return [widget_json(w) for w in await widgets_of(session, dataset)]


@router.post(
    "/{dataset_id}/widgets",
    status_code=201,
    response_model=WidgetModel,
    responses=problems(401, 404, 422),
    **UNSET,
)
async def create_widget(
    session: Session,
    principal: CurrentPrincipal,
    dataset_id: str,
    body: Annotated[WidgetRequest, Body()],
) -> Json:
    dataset = await find_dataset(session, principal, dataset_id)
    spec = await checked_spec(session, dataset, body)
    last = await session.scalar(
        select(func.max(Widget.position)).where(Widget.dataset_id == dataset.id)
    )
    widget = Widget(
        dataset_id=dataset.id,
        kind="custom",
        spec=spec,
        position=0 if last is None else last + 1,
    )
    session.add(widget)
    await session.commit()
    await session.refresh(widget)
    return widget_json(widget)


@router.patch(
    "/{dataset_id}/widgets/{widget_id}",
    response_model=WidgetModel,
    responses=problems(401, 404, 409, 422),
    **UNSET,
)
async def update_widget(
    session: Session,
    principal: CurrentPrincipal,
    dataset_id: str,
    widget_id: str,
    body: Annotated[WidgetRequest, Body()],
) -> Json:
    dataset = await find_dataset(session, principal, dataset_id)
    widget = await find_widget(session, dataset, widget_id)
    if widget.kind != "custom":
        raise Problem(
            409, "Built-in chart", "Built-in charts can't be edited. Add a new chart instead."
        )
    widget.spec = await checked_spec(session, dataset, body)
    await session.commit()
    return widget_json(widget)


@router.delete("/{dataset_id}/widgets/{widget_id}", status_code=204, responses=problems(401, 404))
async def delete_widget(
    session: Session, principal: CurrentPrincipal, dataset_id: str, widget_id: str
) -> Response:
    dataset = await find_dataset(session, principal, dataset_id)
    widget = await find_widget(session, dataset, widget_id)
    await session.delete(widget)
    await session.commit()
    return Response(status_code=204)
