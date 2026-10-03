"""Response models for the API contract (PRD §9).

Handlers keep building plain dicts (app/serialize.py, the engine); these models
type the routes so FastAPI validates every response and the OpenAPI spec
describes real shapes — that spec generates the web app's types
(packages/api-types), so drift breaks the build.

Fields are snake_case with camelCase aliases, matching the wire format. Routes
use `response_model_exclude_unset=True`, so a key the handler omits stays
omitted (a fact's `ref`, a histogram's `x2`) while an explicit null is kept.
"""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

DatasetStatus = Literal["uploading", "queued", "processing", "ready", "failed"]
FileType = Literal["csv", "xlsx"]
ColumnTypeName = Literal["numeric", "categorical", "datetime", "boolean", "text", "id"]
TimeGrainName = Literal["hour", "day", "week", "month"]
AggregationName = Literal["sum", "avg", "count", "min", "max", "count_distinct"]
ChartTypeName = Literal["line", "area", "bar", "donut", "histogram"]
ValueFormatName = Literal["number", "currency", "percent", "duration_ms", "change"]
KpiFormatName = Literal["number", "currency", "percent", "duration_ms"]
JobStageName = Literal[
    "queued", "parsing", "profiling", "building_dashboard", "generating_insight", "ready", "failed"
]


# JSON numbers: `int | float` keeps whole numbers whole (a plain `float` would
# turn 12253 into 12253.0 on the wire).
Num = int | float


class Schema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Problem(Schema):
    """RFC 7807 error body (`application/problem+json`)."""

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    # Field-level messages, keyed by request field.
    errors: dict[str, str] | None = None
    instance: str | None = None


# ---------- Datasets and columns ----------


class NumericProfile(Schema):
    min: Num
    max: Num
    mean: Num
    median: Num
    p95: Num
    sum: Num


class ValueCount(Schema):
    value: str
    count: int


class CategoricalProfile(Schema):
    top: list[ValueCount]


class DatetimeProfile(Schema):
    min: str
    max: str
    grain: TimeGrainName


class ColumnProfile(Schema):
    # Share of missing values, 0..1.
    null_pct: Num
    distinct_count: int
    numeric: NumericProfile | None = None
    categorical: CategoricalProfile | None = None
    datetime: DatetimeProfile | None = None


class DatasetColumn(Schema):
    id: str
    name: str
    original_name: str
    position: int
    inferred_type: ColumnTypeName
    override_type: ColumnTypeName | None = None
    profile: ColumnProfile


class Dataset(Schema):
    id: str
    name: str
    original_filename: str
    file_type: FileType
    size_bytes: int
    row_count: int | None = None
    column_count: int | None = None
    status: DatasetStatus
    error_message: str | None = None
    # Latest ingest job, so lists can subscribe to progress.
    job_id: str | None = None
    created_at: str
    ready_at: str | None = None


class DatasetDetail(Dataset):
    columns: list[DatasetColumn]


class DatasetList(Schema):
    items: list[Dataset]
    next_cursor: str | None = None


class UploadResponse(Schema):
    dataset: Dataset
    job_id: str


class SampleRequest(Schema):
    key: str | None = None


class ColumnTypeRequest(Schema):
    type: Any = "missing"


# ---------- Jobs (SSE payloads; the stream itself is not typed by OpenAPI) ----------


class JobProgressEvent(Schema):
    """`event: progress` payload."""

    job_id: str
    stage: JobStageName
    progress: int
    message: str


class JobDoneEvent(Schema):
    """`event: done` payload; the stream closes after it."""

    job_id: str
    dataset_id: str
    status: Literal["ready", "failed"]
    error_message: str | None = None


JobEvent = JobProgressEvent | JobDoneEvent


# ---------- Filters, widgets and queries ----------


class DateRange(Schema):
    column: str
    # "from" is a keyword in Python; the wire name is unchanged.
    start: Annotated[str | None, Field(alias="from")] = None
    end: Annotated[str | None, Field(alias="to")] = None


class WhereFilter(Schema):
    column: str
    op: Literal["in"] = "in"
    values: list[str]


class Filters(Schema):
    date_range: DateRange | None = None
    where: list[WhereFilter] | None = None


class WidgetSpec(Schema):
    chart_type: ChartTypeName
    title: str
    # Dimension on the x axis (datetime or categorical); the numeric column for histograms.
    x: str
    # Measure column; omitted for count.
    y: str | None = None
    aggregation: AggregationName
    split: str | None = None
    time_grain: TimeGrainName | None = None
    # Max categories before the rest fold into "Other".
    limit: int | None = None


class Widget(Schema):
    id: str
    dataset_id: str
    kind: Literal["auto", "custom"]
    spec: WidgetSpec
    position: int
    created_at: str


class WidgetRequest(Schema):
    """Chart create/update body. The spec stays loose so `validate_spec` can
    answer with the contract's field messages instead of FastAPI's."""

    spec: dict[str, Any] | None = None


class Kpi(Schema):
    id: str
    label: str
    column: str | None = None
    aggregation: AggregationName
    value: Num
    # Relative change against the previous period, e.g. -0.18.
    delta: Num | None = None
    delta_label: str | None = None
    format: KpiFormatName


class SeriesPoint(Schema):
    """One point: `x` plus one number per series, so extra keys are expected."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="allow",
        # One extra key per series, each holding that series' value.
        json_schema_extra={"additionalProperties": {"type": "number"}},
    )

    x: str | Num
    # Histograms: the bucket's upper bound.
    x2: Num | None = None


class WidgetResult(Schema):
    widget_id: str
    series: list[str]
    points: list[SeriesPoint]
    format: ValueFormatName
    # Histograms: how to display the bin bounds.
    x_format: ValueFormatName | None = None


class DashboardResponse(Schema):
    kpis: list[Kpi]
    widgets: list[Widget]
    # Default date column for the filter bar, if the dataset has one.
    date_column: str | None = None


class QueryWidget(Schema):
    id: str
    spec: WidgetSpec


class QueryRequest(Schema):
    widgets: list[QueryWidget] = []
    kpis: bool = False
    filters: Filters = Filters()


class QueryResponse(Schema):
    kpis: list[Kpi]
    results: list[WidgetResult]


class RowsResponse(Schema):
    columns: list[str]
    rows: list[dict[str, bool | int | float | str | None]]
    page: int
    page_size: int
    total: int


class FilterValuesResponse(Schema):
    column: str
    values: list[ValueCount]


# ---------- Insights ----------


class FactRef(Schema):
    """Where a fact lives on the dashboard, for number-to-chart highlighting."""

    widget_id: str
    x: str | Num
    series: str | None = None


class Fact(Schema):
    id: str
    kind: Literal["change", "contributor", "anomaly", "total"]
    label: str
    value: Num
    format: ValueFormatName
    ref: FactRef | None = None


class Anomaly(Schema):
    id: str
    fact_id: str
    column: str
    at: str
    z_score: Num
    direction: Literal["spike", "drop"]
    description: str


class Insight(Schema):
    id: str
    dataset_id: str
    # Narrative text; numbers appear only as {{factId}} references.
    summary: str
    findings: list[str]
    next_questions: list[str]
    facts: list[Fact]
    anomalies: list[Anomaly]
    provider: str
    model: str
    created_at: str


class RegenerateInsightResponse(Schema):
    job_id: str


class Health(Schema):
    status: str


# Routes mirror the handler dicts exactly: an omitted key stays omitted.
UNSET: dict[str, Any] = {"response_model_exclude_unset": True}

_TITLES = {
    400: "Invalid request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    413: "File too large",
    415: "Unsupported file type",
    422: "Validation failed",
    429: "Too many requests",
}


def problems(*codes: int) -> dict[int | str, dict[str, Any]]:
    """Documents the RFC 7807 bodies a route can return."""
    return {code: {"model": Problem, "description": _TITLES[code]} for code in codes}
