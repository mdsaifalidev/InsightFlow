# ADR-004: Polars instead of Pandas

**Status:** Accepted · 2026-09-21

## Context
The original idea specified Pandas + NumPy. The MVP must parse and profile 100MB (~1M row) files in under 30s and query Parquet with filters in under 500ms.

## Decision
Use **Polars** (lazy API) for parsing, profiling, rollups, and ad-hoc Parquet queries. NumPy is used only where statistics need it. XLSX is read through the `fastexcel`/calamine engine that Polars uses.

## Consequences
- Multi-threaded Rust engine, typically 5–10x faster than Pandas with lower memory. Lazy scans give predicate and projection pushdown on Parquet.
- A benchmark (Polars vs Pandas) becomes a measurable resume metric.
- A smaller ecosystem than Pandas. Some statistics helpers may need NumPy/SciPy.
