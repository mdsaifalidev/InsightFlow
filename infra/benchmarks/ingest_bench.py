"""Upload → ready timing for the large CSV (PRD §7: < 30s from upload complete
to ready, excluding the LLM step; 202 in < 1s).

Uploads through the gateway, then follows the job's SSE stream and records
when each stage ends. "Dashboard ready" is the end of building_dashboard (the
last stage before the brief); "ready" includes the (mock) brief.

    uv run --project services/data-py python infra/benchmarks/ingest_bench.py [runs] [file]
"""

import json
from contextlib import closing
import sys
import time
from pathlib import Path

import httpx

from common import signed_in_client

RUNS = int(sys.argv[1]) if len(sys.argv) > 1 else 3
FILE = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "data" / "orders_1m.csv"


def follow(client: httpx.Client, job_id: str, started: float) -> dict[str, float]:
    """Seconds (since upload complete) at which each stage finished."""
    marks: dict[str, float] = {}
    with client.stream("GET", f"/api/data/jobs/{job_id}/events", timeout=600) as response:
        response.raise_for_status()
        event = ""
        for line in response.iter_lines():
            if line.startswith("event: "):
                event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
                elapsed = time.perf_counter() - started
                if event == "progress":
                    marks[f"{data['stage']}@{data['progress']}"] = elapsed
                elif event == "done":
                    marks["done"] = elapsed
                    marks["status_ok"] = 1.0 if data["status"] == "ready" else 0.0
                    return marks
    return marks


def main() -> None:
    size_mb = FILE.stat().st_size / 1e6
    print(f"file: {FILE.name} ({size_mb:.1f} MB)")
    with closing(signed_in_client()) as client:
        for run in range(1, RUNS + 1):
            request_started = time.perf_counter()
            with FILE.open("rb") as f:
                response = client.post(
                    "/api/data/datasets",
                    files={"file": (FILE.name, f, "text/csv")},
                    timeout=600,
                )
            upload_complete = time.perf_counter()
            response.raise_for_status()
            body = response.json()
            marks = follow(client, body["jobId"], upload_complete)
            server_ms = response.headers.get("server-timing", "app;dur=?").split("dur=")[-1]
            stages = ", ".join(
                f"{name.split('@')[0]} {marks[name]:.1f}s"
                for name in ("queued@5", "parsing@35", "profiling@60", "building_dashboard@80")
                if name in marks
            )
            print(
                f"run {run}: upload request {upload_complete - request_started:.2f}s "
                f"(server time after receiving the body: {server_ms} ms); "
                f"stage ends after upload: {stages}; "
                f"ready incl. brief {marks['done']:.1f}s; "
                f"{'ready' if marks.get('status_ok') else 'FAILED'}"
            )
            client.delete(f"/api/data/datasets/{body['dataset']['id']}")


if __name__ == "__main__":
    main()
