"""Filtered dashboard query latency at 1M rows (PRD §7: p95 < 500ms).

Ingests the large CSV once, then sends the dashboard's real request: every
auto widget plus KPIs, with a date range and a category filter that change
per call, so no response is cached anywhere.

    uv run --project services/data-py python infra/benchmarks/query_bench.py [calls] [file]
"""

import json
from contextlib import closing
import sys
import time
from pathlib import Path

from common import percentile, signed_in_client

CALLS = int(sys.argv[1]) if len(sys.argv) > 1 else 50
FILE = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "data" / "orders_1m.csv"
REGIONS = ["North America", "Europe", "Asia Pacific", "Latin America", "Middle East", "Africa"]


def main() -> None:
    with closing(signed_in_client()) as client:
        with FILE.open("rb") as f:
            created = client.post(
                "/api/data/datasets", files={"file": (FILE.name, f, "text/csv")}, timeout=600
            ).json()
        dataset_id = created["dataset"]["id"]
        with client.stream("GET", f"/api/data/jobs/{created['jobId']}/events", timeout=600) as r:
            for line in r.iter_lines():
                if line.startswith("event: done"):
                    break

        dashboard = client.get(f"/api/data/datasets/{dataset_id}/dashboard").json()
        widgets = [{"id": w["id"], "spec": w["spec"]} for w in dashboard["widgets"]]
        print(f"dataset {dataset_id}: {len(widgets)} widgets + KPIs per query")

        timings: list[float] = []
        for call in range(CALLS + 1):
            month = call % 12 + 1
            filters = {
                "dateRange": {
                    "column": dashboard["dateColumn"],
                    "from": f"2024-{month:02d}-01",
                    "to": f"2025-{month:02d}-28",
                },
                "where": [
                    {"column": "region", "op": "in", "values": REGIONS[call % 3 : call % 3 + 2]}
                ],
            }
            started = time.perf_counter()
            response = client.post(
                f"/api/data/datasets/{dataset_id}/query",
                json={"widgets": widgets, "filters": filters, "kpis": True},
            )
            elapsed = (time.perf_counter() - started) * 1000
            response.raise_for_status()
            if call == 0:
                print(f"first call (loads the Parquet frame): {elapsed:.0f} ms")
            else:
                timings.append(elapsed)

        rows = client.get(
            f"/api/data/datasets/{dataset_id}/rows",
            params={"pageSize": "50", "sort": "revenue:desc", "filters": json.dumps(filters)},
        )
        print(f"rows page (sorted, filtered): {rows.elapsed.total_seconds() * 1000:.0f} ms")
        print(
            f"{CALLS} filtered queries: p50 {percentile(timings, 50):.0f} ms, "
            f"p95 {percentile(timings, 95):.0f} ms, max {max(timings):.0f} ms"
        )
        client.delete(f"/api/data/datasets/{dataset_id}")


if __name__ == "__main__":
    main()
