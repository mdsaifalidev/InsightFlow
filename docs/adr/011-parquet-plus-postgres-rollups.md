# ADR-011: Parquet in object storage + Postgres rollups

**Status:** Accepted · 2026-09-21

## Context
Uploaded datasets have arbitrary schemas. Storing rows in Postgres would need dynamic tables or JSONB, and both aggregate poorly. Yet the product story includes "Postgres indexing for multi-month aggregate queries".

## Decision
- Row-level data is stored as **Parquet in object storage** (RustFS locally, R2/S3 in prod) and queried with Polars lazy scans, using a local cache on the API container.
- At ingest, the worker precomputes **`analytics.metric_rollups`** (measure × time grain × optional dimension) and bulk-loads them with `COPY`. A composite index `(dataset_id, measure, time_grain, bucket_start)` serves KPI and time-series widgets.
- A query planner routes each widget to the rollups when possible, and to Parquet otherwise.

## Consequences
- Fast dashboards with a fixed Postgres schema. A measurable "indexed rollups vs raw scan" benchmark.
- Rollups must be recomputed when a column type is overridden.
- ~~**Risk:** MinIO's community distribution has changed licensing and packaging.~~ Resolved by [ADR-012](./012-rustfs-object-storage.md): RustFS locally.

## Amendment (Phase 4, 2026-09-22): rollups deferred, measured
Before building the rollup planner, Phase 4 measured plain Polars over the cached Parquet file (`infra/benchmarks/RESULTS.md`). At 1M rows × 12 columns, in the dev Docker stack on a 2-core laptop:
- Filtered dashboard query (6 widgets + KPIs, date range + category filter): **p95 368–377 ms** against the 500 ms target. The first version measured 631 ms; grouping on truncated timestamps and one-pass KPI windows closed the gap.
- The typed frame is read once per Parquet version into an in-process LRU (`app/frames.py`), so queries don't touch object storage.

So `metric_rollups` is **not built**: it would add a second copy of the data, recompute on every type override, and a planner, without a measured need. Revisit when data sizes or targets change; the benchmark scripts are the gate.
