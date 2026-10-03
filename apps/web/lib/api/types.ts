// API contract types, hand-written from docs/PRD.md §9.
// Replaced by generated types (packages/api-types) in Phase 5; keep the shapes
// identical to the PRD so MSW mocks and the real services stay interchangeable.

// ---------- Auth service (/api/auth) ----------

export type User = {
  id: string
  email: string
  name: string
  createdAt: string
}

export type Workspace = {
  id: string
  name: string
}

export type AuthResponse = {
  user: User
  workspace: Workspace
  accessToken: string
}

export type RefreshResponse = {
  accessToken: string
}

export type MeResponse = {
  user: User
  workspace: Workspace
}

export type RegisterRequest = { name: string; email: string; password: string }
export type LoginRequest = { email: string; password: string }
export type UpdateMeRequest = {
  name?: string
  currentPassword?: string
  newPassword?: string
}

// ---------- Data service (/api/data) ----------

export type DatasetStatus =
  "uploading" | "queued" | "processing" | "ready" | "failed"

export type FileType = "csv" | "xlsx"

export type ColumnType =
  "numeric" | "categorical" | "datetime" | "boolean" | "text" | "id"

export type Dataset = {
  id: string
  name: string
  originalFilename: string
  fileType: FileType
  sizeBytes: number
  rowCount: number | null
  columnCount: number | null
  status: DatasetStatus
  errorMessage: string | null
  /** Latest ingest job, so lists can subscribe to progress. */
  jobId: string | null
  createdAt: string
  readyAt: string | null
}

export type NumericProfile = {
  min: number
  max: number
  mean: number
  median: number
  p95: number
  sum: number
}

export type CategoricalProfile = {
  top: { value: string; count: number }[]
}

export type DatetimeProfile = {
  min: string
  max: string
  grain: TimeGrain
}

export type ColumnProfile = {
  nullPct: number
  distinctCount: number
  numeric?: NumericProfile
  categorical?: CategoricalProfile
  datetime?: DatetimeProfile
}

export type DatasetColumn = {
  id: string
  name: string
  originalName: string
  position: number
  inferredType: ColumnType
  overrideType: ColumnType | null
  profile: ColumnProfile
}

export type DatasetDetail = Dataset & { columns: DatasetColumn[] }

export type DatasetList = {
  items: Dataset[]
  nextCursor: string | null
}

export type UploadResponse = {
  dataset: Dataset
  jobId: string
}

export type SampleKey = "orders" | "saas" | "weblogs"

// ---------- Jobs / SSE ----------

export type JobStage =
  | "queued"
  | "parsing"
  | "profiling"
  | "building_dashboard"
  | "generating_insight"
  | "ready"
  | "failed"

export type JobProgressEvent = {
  jobId: string
  stage: JobStage
  progress: number
  message: string
}

export type JobDoneEvent = {
  jobId: string
  datasetId: string
  status: "ready" | "failed"
  errorMessage?: string
}

// ---------- Filters & queries ----------

export type TimeGrain = "hour" | "day" | "week" | "month"

export type Filters = {
  dateRange?: { column: string; from?: string; to?: string }
  where?: { column: string; op: "in"; values: string[] }[]
}

export type Aggregation =
  "sum" | "avg" | "count" | "min" | "max" | "count_distinct"

export type ChartType = "line" | "area" | "bar" | "donut" | "histogram"

export type WidgetSpec = {
  chartType: ChartType
  title: string
  /** Dimension on the x axis (datetime or categorical column). Histogram: the numeric column. */
  x: string
  /** Measure column; omitted for count. */
  y?: string
  aggregation: Aggregation
  /** Optional series split (categorical column). */
  split?: string
  timeGrain?: TimeGrain
  /** Max categories before grouping the rest into "Other". */
  limit?: number
}

export type Widget = {
  id: string
  datasetId: string
  kind: "auto" | "custom"
  spec: WidgetSpec
  position: number
  createdAt: string
}

/**
 * How to display a value:
 * - number: plain; currency: $; duration_ms: milliseconds
 * - percent: value is already in percentage points (7.2 → "7.2%")
 * - change: signed fraction (-0.184 → "−18.4%")
 */
export type ValueFormat =
  "number" | "currency" | "percent" | "duration_ms" | "change"

export type Kpi = {
  id: string
  label: string
  column: string | null
  aggregation: Aggregation
  value: number
  /** Relative change vs. previous period of equal length, e.g. -0.18. */
  delta: number | null
  /** What the delta compares, e.g. "Last 30 days vs prior 30". */
  deltaLabel: string | null
  format: Exclude<ValueFormat, "change">
}

export type CreateWidgetRequest = { spec: WidgetSpec }
export type UpdateWidgetRequest = { spec: WidgetSpec }

export type RegenerateInsightResponse = { jobId: string }

export type DashboardResponse = {
  kpis: Kpi[]
  widgets: Widget[]
  /** Default date column for the filter bar, if the dataset has one. */
  dateColumn: string | null
}

export type SeriesPoint = {
  x: string | number
  /** For histograms: bucket upper bound. */
  x2?: number
  [series: string]: string | number | undefined
}

export type WidgetResult = {
  widgetId: string
  series: string[]
  points: SeriesPoint[]
  /** How to display the values (y axis, tooltips). */
  format: ValueFormat
  /** Histograms: how to display bin bounds on the x axis. */
  xFormat?: ValueFormat
}

export type QueryRequest = {
  widgets: { id: string; spec: WidgetSpec }[]
  kpis?: boolean
  filters: Filters
}

export type QueryResponse = {
  kpis: Kpi[]
  results: WidgetResult[]
}

export type RowsResponse = {
  columns: string[]
  rows: Record<string, string | number | boolean | null>[]
  page: number
  pageSize: number
  total: number
}

export type FilterValuesResponse = {
  column: string
  values: { value: string; count: number }[]
}

// ---------- Insights ----------

/** A computed fact; LLM text may only cite numbers that appear in facts. */
export type Fact = {
  id: string
  kind: "change" | "contributor" | "anomaly" | "total"
  label: string
  value: number
  format: ValueFormat
  /** Where this fact lives on the dashboard, for number-to-chart highlighting. */
  ref?: { widgetId: string; x: string | number; series?: string }
}

/** Narrative text with inline fact references, e.g. "Revenue fell {{f1}} in March". */
export type InsightText = string

export type Anomaly = {
  id: string
  factId: string
  column: string
  at: string
  zScore: number
  direction: "spike" | "drop"
  description: string
}

export type Insight = {
  id: string
  datasetId: string
  summary: InsightText
  findings: InsightText[]
  nextQuestions: string[]
  facts: Fact[]
  anomalies: Anomaly[]
  provider: string
  model: string
  createdAt: string
}
