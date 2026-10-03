"""Dataset API, ingest pipeline and SSE against real Postgres and Redis."""

import asyncio
import json
import uuid
from typing import Any

import httpx
import pytest

from app.events import USER_DELETED
from tests.conftest import Api, make_token, run_jobs


def parse_sse(text: str) -> list[dict[str, Any]]:
    events = []
    for block in text.strip().split("\n\n"):
        fields: dict[str, str] = {}
        for line in block.splitlines():
            if line.startswith(":"):
                continue
            key, _, value = line.partition(": ")
            fields[key] = value
        if "event" in fields:
            events.append(
                {
                    "id": int(fields["id"]),
                    "event": fields["event"],
                    "data": json.loads(fields["data"]),
                }
            )
    return events


async def subscribed(app: Any, channel: str) -> None:
    """Waits until something listens on a Redis channel (no fixed sleeps)."""
    for _ in range(200):
        counts = dict(await app.state.redis.pubsub_numsub(channel))
        if counts.get(channel.encode(), 0) > 0:
            return
        await asyncio.sleep(0.05)
    raise AssertionError(f"nobody subscribed to {channel}")


async def load_sample(api: Api, app: Any, key: str = "saas") -> dict[str, Any]:
    response = await api.post("/api/data/datasets/sample", json={"key": key})
    assert response.status_code == 202, response.text
    body: dict[str, Any] = response.json()
    await run_jobs(app)
    return body


async def test_requires_a_valid_token(client: httpx.AsyncClient) -> None:
    workspace = uuid.uuid4()
    cases = [
        {},
        {"Authorization": "Bearer nope"},
        {"Authorization": f"Bearer {make_token(workspace, aud='someone-else')}"},
        {"Authorization": f"Bearer {make_token(workspace, exp=1)}"},
        {"Authorization": f"Bearer {make_token(workspace, wid='not-a-uuid')}"},
    ]
    for headers in cases:
        response = await client.get("/api/data/datasets", headers=headers)
        assert response.status_code == 401
        assert response.headers["content-type"] == "application/problem+json"
        assert response.json()["detail"] == "Your session has expired. Sign in again."


async def test_sample_ingest_reaches_ready_with_profiled_columns(api: Api, app: Any) -> None:
    created = await load_sample(api, app, "orders")
    assert created["dataset"]["status"] == "queued"
    assert created["dataset"]["jobId"] == created["jobId"]

    detail = (await api.get(f"/api/data/datasets/{created['dataset']['id']}")).json()
    assert detail["status"] == "ready"
    assert detail["rowCount"] == 12253
    assert detail["columnCount"] == 10
    assert detail["readyAt"] is not None
    assert [c["inferredType"] for c in detail["columns"]][:3] == ["id", "datetime", "categorical"]

    stream = await api.get(f"/api/data/jobs/{created['jobId']}/events")
    # no-transform keeps proxies (e.g. the Next dev rewrite) from gzipping the stream.
    assert stream.headers["cache-control"] == "no-cache, no-transform"
    events = parse_sse(stream.text)
    assert events[-1]["event"] == "done"
    assert events[-1]["data"]["status"] == "ready"


async def test_sse_streams_every_stage_in_order(
    api: Api, app: Any, client: httpx.AsyncClient
) -> None:
    created = (await api.post("/api/data/datasets/sample", json={"key": "weblogs"})).json()
    stream = asyncio.create_task(api.get(f"/api/data/jobs/{created['jobId']}/events"))
    await subscribed(app, f"job:{created['jobId']}")
    await run_jobs(app)
    events = parse_sse((await asyncio.wait_for(stream, 10)).text)

    ids = [e["id"] for e in events]
    assert ids == sorted(ids) and len(set(ids)) == len(ids)
    stages = [e["data"]["stage"] for e in events if e["event"] == "progress"]
    assert stages[0] == "queued"
    assert "parsing" in stages and "profiling" in stages and "generating_insight" in stages
    progress = [e["data"]["progress"] for e in events if e["event"] == "progress"]
    assert progress == sorted(progress)
    assert events[-1] == {
        "id": ids[-1],
        "event": "done",
        "data": {
            "jobId": created["jobId"],
            "datasetId": created["dataset"]["id"],
            "status": "ready",
        },
    }


async def test_datasets_are_private_to_their_workspace(api: Api, other_api: Api, app: Any) -> None:
    created = await load_sample(api, app)
    dataset_id = created["dataset"]["id"]
    assert (await other_api.get(f"/api/data/datasets/{dataset_id}")).status_code == 404
    assert (await other_api.get(f"/api/data/jobs/{created['jobId']}/events")).status_code == 404
    assert (
        await other_api.request("DELETE", f"/api/data/datasets/{dataset_id}")
    ).status_code == 404
    assert (await other_api.get("/api/data/datasets")).json()["items"] == []


async def test_lists_with_search_sort_and_cursor(api: Api, app: Any) -> None:
    for key in ("orders", "saas", "weblogs"):
        await api.post("/api/data/datasets/sample", json={"key": key})
    await run_jobs(app)

    names = [d["name"] for d in (await api.get("/api/data/datasets?sort=name")).json()["items"]]
    assert names == ["E-commerce orders", "SaaS subscriptions", "Web traffic logs"]
    rows = [d["rowCount"] for d in (await api.get("/api/data/datasets?sort=rows")).json()["items"]]
    assert rows == sorted(rows, reverse=True)
    found = (await api.get("/api/data/datasets?q=ACCESS_LOGS")).json()["items"]
    assert [d["name"] for d in found] == ["Web traffic logs"]
    page = (await api.get("/api/data/datasets")).json()
    assert page["nextCursor"] is None and len(page["items"]) == 3


@pytest.mark.parametrize(
    ("filename", "content", "content_type", "status", "field"),
    [
        ("notes.txt", b"a,b\n1,2\n", "text/plain", 415, None),
        ("data.csv", b"a,b\n1,2\n", "image/png", 415, None),
        ("data.csv", b"", "text/csv", 422, "file"),
    ],
)
async def test_validates_uploads(
    api: Api, filename: str, content: bytes, content_type: str, status: int, field: str | None
) -> None:
    response = await api.post(
        "/api/data/datasets", files={"file": (filename, content, content_type)}
    )
    assert response.status_code == status
    if field:
        assert field in response.json()["errors"]


async def test_upload_without_a_file_is_a_field_error(api: Api) -> None:
    response = await api.post("/api/data/datasets", data={"name": "x"})
    assert response.status_code == 422
    assert response.json()["errors"] == {"file": "Choose a file to upload."}


async def test_rejects_files_over_the_limit(api: Api, app: Any) -> None:
    settings = app.state.settings
    original = settings.max_upload_bytes
    settings.max_upload_bytes = 10
    try:
        response = await api.post(
            "/api/data/datasets", files={"file": ("big.csv", b"a,b\n1,2\n3,4\n", "text/csv")}
        )
    finally:
        settings.max_upload_bytes = original
    assert response.status_code == 413


async def test_uploads_store_the_raw_file_and_ingest(api: Api, app: Any, s3: Any) -> None:
    csv = b"Region,Revenue,Order Date\nNorth,10.5,2025-01-01\nSouth,4,2025-01-02\n"
    response = await api.post(
        "/api/data/datasets",
        files={"file": ("q1 sales.csv", csv, "text/csv")},
        data={"name": "  "},
    )
    assert response.status_code == 202
    dataset = response.json()["dataset"]
    assert dataset["name"] == "q1 sales"
    assert dataset["fileType"] == "csv"
    assert dataset["sizeBytes"] == len(csv)
    raw = s3.get_object(Bucket="insightflow-raw", Key=f"raw/{api.workspace_id}/{dataset['id']}.csv")
    assert raw["Body"].read() == csv

    await run_jobs(app)
    detail = (await api.get(f"/api/data/datasets/{dataset['id']}")).json()
    assert detail["status"] == "ready"
    assert [c["name"] for c in detail["columns"]] == ["region", "revenue", "order_date"]
    assert [c["originalName"] for c in detail["columns"]] == ["Region", "Revenue", "Order Date"]


async def test_malformed_files_fail_with_a_readable_message(api: Api, app: Any) -> None:
    csv = b"a,b\n1,2\n1,2,3\n"
    created = (
        await api.post("/api/data/datasets", files={"file": ("bad.csv", csv, "text/csv")})
    ).json()
    await run_jobs(app)
    detail = (await api.get(f"/api/data/datasets/{created['dataset']['id']}")).json()
    assert detail["status"] == "failed"
    assert detail["errorMessage"] == "Row 3 has 3 columns, expected 2."
    events = parse_sse((await api.get(f"/api/data/jobs/{created['jobId']}/events")).text)
    assert events == [
        {
            "id": events[0]["id"],
            "event": "done",
            "data": {
                "jobId": created["jobId"],
                "datasetId": created["dataset"]["id"],
                "status": "failed",
                "errorMessage": "Row 3 has 3 columns, expected 2.",
            },
        }
    ]


async def test_column_type_override_reprofiles_and_can_be_reset(api: Api, app: Any) -> None:
    created = await load_sample(api, app, "weblogs")
    dataset_id = created["dataset"]["id"]
    columns = (await api.get(f"/api/data/datasets/{dataset_id}")).json()["columns"]
    latency = next(c for c in columns if c["name"] == "latency_ms")
    url = f"/api/data/datasets/{dataset_id}/columns/{latency['id']}"

    changed = (await api.request("PATCH", url, json={"type": "categorical"})).json()
    assert changed["overrideType"] == "categorical"
    assert "categorical" in changed["profile"] and "numeric" not in changed["profile"]

    reset = (await api.request("PATCH", url, json={"type": None})).json()
    assert reset["overrideType"] is None
    assert reset["profile"] == latency["profile"]

    invalid = await api.request("PATCH", url, json={"type": "money"})
    assert invalid.status_code == 422
    assert invalid.json()["errors"] == {"type": "Invalid type."}
    missing = await api.request(
        "PATCH", f"/api/data/datasets/{dataset_id}/columns/{uuid.uuid4()}", json={"type": None}
    )
    assert missing.status_code == 404


async def test_column_types_can_only_change_once_ready(api: Api, app: Any) -> None:
    created = (await api.post("/api/data/datasets/sample", json={"key": "saas"})).json()
    response = await api.request(
        "PATCH",
        f"/api/data/datasets/{created['dataset']['id']}/columns/{uuid.uuid4()}",
        json={"type": "text"},
    )
    assert response.status_code == 409
    assert response.json()["title"] == "Dataset not ready"
    await run_jobs(app)


async def test_unknown_samples_are_rejected(api: Api) -> None:
    response = await api.post("/api/data/datasets/sample", json={"key": "nope"})
    assert response.status_code == 422
    assert response.json()["errors"] == {"key": "Unknown sample."}


async def test_delete_removes_rows_and_files(api: Api, app: Any, s3: Any) -> None:
    csv = b"a,b\nx,1\ny,2\n"
    created = (
        await api.post("/api/data/datasets", files={"file": ("t.csv", csv, "text/csv")})
    ).json()
    await run_jobs(app)
    dataset_id = created["dataset"]["id"]
    prefix = f"parquet/{api.workspace_id}/{dataset_id}/"
    assert s3.list_objects_v2(Bucket="insightflow-parquet", Prefix=prefix)["KeyCount"] == 1

    assert (await api.request("DELETE", f"/api/data/datasets/{dataset_id}")).status_code == 204
    assert (await api.get(f"/api/data/datasets/{dataset_id}")).status_code == 404
    assert s3.list_objects_v2(Bucket="insightflow-parquet", Prefix=prefix)["KeyCount"] == 0
    raw_prefix = f"raw/{api.workspace_id}/"
    assert s3.list_objects_v2(Bucket="insightflow-raw", Prefix=raw_prefix)["KeyCount"] == 0


async def test_deleted_accounts_purge_their_workspace(api: Api, other_api: Api, app: Any) -> None:
    from app.events import listen_for_deleted_users
    from app.pipeline import Context

    await load_sample(api, app)
    kept = await load_sample(other_api, app)

    ctx = Context(
        sessionmaker=app.state.sessionmaker,
        redis=app.state.redis,
        storage=app.state.storage,
        settings=app.state.settings,
    )
    listener = asyncio.create_task(listen_for_deleted_users(ctx))
    await subscribed(app, USER_DELETED)
    payload = {"userId": str(uuid.uuid4()), "workspaceId": str(api.workspace_id), "at": "now"}
    await app.state.redis.publish(USER_DELETED, json.dumps(payload))
    for _ in range(50):
        if not (await api.get("/api/data/datasets")).json()["items"]:
            break
        await asyncio.sleep(0.1)
    listener.cancel()

    assert (await api.get("/api/data/datasets")).json()["items"] == []
    assert (await other_api.get(f"/api/data/datasets/{kept['dataset']['id']}")).status_code == 200


async def test_health(client: httpx.AsyncClient) -> None:
    assert (await client.get("/api/data/health")).json() == {"status": "ok"}
    assert (await client.get("/ready")).json() == {"status": "ready"}


async def test_large_uploads_stream_to_storage_in_parts(api: Api, app: Any, s3: Any) -> None:
    row = b"North,12.50,2025-01-01,some longer text to make the file bigger\n"
    csv = b"region,revenue,day,note\n" + row * (18 * 1024 * 1024 // len(row))
    response = await api.post("/api/data/datasets", files={"file": ("big.csv", csv, "text/csv")})
    assert response.status_code == 202
    assert "app;dur=" in response.headers["server-timing"]
    dataset = response.json()["dataset"]
    assert dataset["sizeBytes"] == len(csv)
    stored = s3.get_object(
        Bucket="insightflow-raw", Key=f"raw/{api.workspace_id}/{dataset['id']}.csv"
    )
    assert stored["ContentLength"] == len(csv)
    assert stored["Body"].read() == csv
    await api.request("DELETE", f"/api/data/datasets/{dataset['id']}")
