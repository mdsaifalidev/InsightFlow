# Benchmark results

Measured numbers only (CLAUDE.md rule). Re-run the scripts after engine changes and replace the tables.

## Setup (2026-09-22)

| | |
|---|---|
| Machine | Intel Core i7-6600U @ 2.60GHz (2 cores / 4 threads), 15.9 GB RAM, Windows 10 |
| Runtime | Docker Desktop (Docker 29.6.1), 4 CPUs and 7.7 GB given to Docker |
| Stack | `pnpm stack:up` dev containers: nginx gateway → `data-py` (single `uvicorn --reload` process) + `data-worker` (ARQ), Postgres 17, Redis 7, RustFS. Source is bind-mounted from Windows. LLM provider: `mock`. |
| Data | `gen_large.py`: 1,000,000 rows × 12 columns, 86.7 MB CSV (fits under the 100 MB upload limit) |

Dev mode is the pessimistic case: reload watchers, bind mounts, one API process, Docker Desktop's VM.

## Ingest (`ingest_bench.py`, 3 runs)

Targets (PRD §7, F2): 202 in < 1s after the upload completes; upload complete → ready in < 30s, LLM step excluded.

| Run | Upload request (client, incl. transfer) | Server time after last byte (→ 202) | Parsed | Dashboard ready (all stages but the brief) | Ready incl. mock brief |
|---|---|---|---|---|---|
| 1 | 4.26 s | 19 ms | 1.8 s | 12.0 s | 14.2 s |
| 2 | 4.49 s | 17 ms | 1.8 s | 12.5 s | 14.9 s |
| 3 | 4.17 s | 14 ms | 1.9 s | 12.2 s | 15.0 s |

Both targets met. Most of the time is type inference and profiling (the `profiling` stage, about 10 s).

## Filtered dashboard query (`query_bench.py`, 50 calls per run)

Target (PRD §7): p95 < 500 ms at 1M rows. Each call is the dashboard's real request: all 6 auto widgets + KPIs, with a date range and a 2-value category filter that change on every call.

| Run | p50 | p95 | max | First call (loads Parquet) | Sorted, filtered rows page |
|---|---|---|---|---|---|
| 1 | 283 ms | 368 ms | 387 ms | 351 ms | 72 ms |
| 2 | 280 ms | 377 ms | 410 ms | — | — |

Target met without pre-aggregated rollups, so ADR-011's `metric_rollups` stays deferred.

## History

What changed between measurements, same machine and setup:

| Change | Metric | Before | After |
|---|---|---|---|
| Stream the upload to S3 in 8 MB parts while it arrives (was: spool to disk, then upload) | Server time after last byte | 1428–1490 ms | 14–174 ms |
| Type inference evaluates rules in order with cheap prefix checks (was: every test on every column) | Dashboard ready | 17.0–17.5 s | 11.7–12.5 s |
| Group time series on truncated timestamps and format only the keys; KPI windows in one masked pass; no Date → Datetime cast when filtering | Query p95 | 631 ms | 368–377 ms |

## Reproduce

```bash
pnpm stack:up
uv run --project services/data-py python infra/benchmarks/gen_large.py        # writes infra/benchmarks/data/orders_1m.csv (gitignored)
uv run --project services/data-py python infra/benchmarks/ingest_bench.py 3
uv run --project services/data-py python infra/benchmarks/query_bench.py 50
```
