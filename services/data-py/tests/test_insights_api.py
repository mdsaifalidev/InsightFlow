"""The brief through the API: written during ingest, regenerated as a job,
rate-limited per dataset.
"""

from typing import Any

from tests.conftest import Api, run_jobs


async def ready_sample(api: Api, app: Any, key: str) -> str:
    response = await api.post("/api/data/datasets/sample", json={"key": key})
    await run_jobs(app)
    return str(response.json()["dataset"]["id"])


async def test_ingest_writes_a_grounded_brief(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app, "orders")
    insight = (await api.get(f"/api/data/datasets/{dataset_id}/insights/latest")).json()
    assert insight["datasetId"] == dataset_id
    assert (insight["provider"], insight["model"]) == ("mock", "template-v1")
    assert "in April 2025, driven mostly by Electronics (category)" in insight["summary"]
    assert insight["anomalies"][0]["at"] == "2025-11-28"
    assert 1 <= len(insight["nextQuestions"]) <= 3

    # Fact references point at this dataset's real widgets.
    widgets = {w["id"] for w in (await api.get(f"/api/data/datasets/{dataset_id}/widgets")).json()}
    refs = [f["ref"]["widgetId"] for f in insight["facts"] if "ref" in f]
    assert refs and set(refs) <= widgets


async def test_brief_waits_for_ready(api: Api, app: Any) -> None:
    response = await api.post("/api/data/datasets/sample", json={"key": "saas"})
    dataset_id = response.json()["dataset"]["id"]
    latest = await api.get(f"/api/data/datasets/{dataset_id}/insights/latest")
    assert latest.status_code == 409
    assert latest.json()["detail"] == "The brief is written once processing finishes."
    await run_jobs(app)


async def test_regenerate_runs_a_job_and_is_rate_limited(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app, "weblogs")
    base = f"/api/data/datasets/{dataset_id}/insights"
    first = (await api.get(f"{base}/latest")).json()

    accepted = await api.post(base)
    assert accepted.status_code == 202
    job_id = accepted.json()["jobId"]
    await run_jobs(app)
    events = (await api.get(f"/api/data/jobs/{job_id}/events")).text
    assert "event: done" in events and '"status": "ready"' in events
    second = (await api.get(f"{base}/latest")).json()
    assert second["id"] != first["id"]
    assert second["summary"] == first["summary"]

    for _ in range(4):
        assert (await api.post(base)).status_code == 202
    limited = await api.post(base)
    assert limited.status_code == 429
    assert limited.json()["detail"] == "You can regenerate the brief 5 times an hour."
    assert 3500 <= int(limited.headers["Retry-After"]) <= 3600
    await run_jobs(app)


async def test_insights_are_private(api: Api, other_api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app, "saas")
    base = f"/api/data/datasets/{dataset_id}/insights"
    assert (await other_api.get(f"{base}/latest")).status_code == 404
    assert (await other_api.post(base)).status_code == 404
