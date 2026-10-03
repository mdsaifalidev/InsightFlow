"""Dashboard, query, rows, filter values and chart CRUD through the API."""

import json
from typing import Any

from tests.conftest import Api, run_jobs


async def ready_sample(api: Api, app: Any, key: str = "orders") -> str:
    response = await api.post("/api/data/datasets/sample", json={"key": key})
    await run_jobs(app)
    return str(response.json()["dataset"]["id"])


def golden(key: str) -> dict[str, Any]:
    from tests.test_engine_query import load

    return load(key)[0]


async def test_dashboard_has_auto_widgets_and_kpis(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app)
    body = (await api.get(f"/api/data/datasets/{dataset_id}/dashboard")).json()
    expected = golden("orders")
    assert body["dateColumn"] == "order_date"
    assert [w["spec"] for w in body["widgets"]] == expected["autoSpecs"]
    assert {w["kind"] for w in body["widgets"]} == {"auto"}
    assert [w["position"] for w in body["widgets"]] == list(range(len(body["widgets"])))
    assert [k["id"] for k in body["kpis"]] == [k["id"] for k in expected["kpis"]]
    assert body["kpis"][0]["value"] == expected["kpis"][0]["value"]


async def test_analytics_wait_for_ready(api: Api, app: Any) -> None:
    response = await api.post("/api/data/datasets/sample", json={"key": "saas"})
    dataset_id = response.json()["dataset"]["id"]
    for path in ("dashboard", "rows", "filters/plan/values"):
        blocked = await api.get(f"/api/data/datasets/{dataset_id}/{path}")
        assert blocked.status_code == 409
        assert blocked.json()["detail"] == "This dataset is still processing."
    await run_jobs(app)


async def test_query_sanitizes_filters_and_returns_kpis_on_request(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app)
    expected = golden("orders")
    spec = expected["specs"][0]
    filters = {
        # The column is replaced by the dataset's date column.
        "dateRange": {"column": "whatever", "from": "2025-03-01", "to": "2025-05-31"},
        "where": [
            {"column": "region", "op": "in", "values": ["North America", "Europe"]},
            {"column": "missing", "op": "in", "values": ["x"]},
            {"column": "channel", "op": "in", "values": []},
        ],
    }
    body = {"widgets": [{"id": "w0", "spec": spec}], "filters": filters, "kpis": True}
    result = (await api.post(f"/api/data/datasets/{dataset_id}/query", json=body)).json()
    assert result["results"][0]["points"] == expected["resultsFiltered"][0]["points"]
    assert [k["value"] for k in result["kpis"]] == [k["value"] for k in expected["kpisFiltered"]]

    preview = {"widgets": [{"id": "preview", "spec": spec}], "filters": {}}
    plain = (await api.post(f"/api/data/datasets/{dataset_id}/query", json=preview)).json()
    assert plain["kpis"] == []
    assert plain["results"][0]["widgetId"] == "preview"


async def test_rows_page_sort_and_filter(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app)
    expected = golden("orders")
    params = {
        "page": "1",
        "pageSize": "25",
        "sort": expected["rowsPage"]["sort"],
        "filters": json.dumps(expected["filters"]),
    }
    body = (await api.get(f"/api/data/datasets/{dataset_id}/rows", params=params)).json()
    assert body["total"] == expected["rowsPage"]["total"]
    assert body["pageSize"] == 25
    assert body["columns"][:2] == ["order_id", "order_date"]
    assert [r["order_id"] for r in body["rows"]] == [
        r["order_id"] for r in expected["rowsPage"]["rows"]
    ]

    fallback = await api.get(
        f"/api/data/datasets/{dataset_id}/rows", params={"pageSize": "7", "page": "2"}
    )
    assert fallback.json()["pageSize"] == 50 and fallback.json()["page"] == 2
    assert len(fallback.json()["rows"]) == 50

    invalid = await api.get(f"/api/data/datasets/{dataset_id}/rows", params={"filters": "{"})
    assert invalid.status_code == 400
    assert invalid.json()["title"] == "Invalid filters"


async def test_filter_values(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app, "weblogs")
    body = (await api.get(f"/api/data/datasets/{dataset_id}/filters/path/values")).json()
    counts = [v["count"] for v in body["values"]]
    assert body["column"] == "path" and counts == sorted(counts, reverse=True)
    found = (
        await api.get(f"/api/data/datasets/{dataset_id}/filters/path/values", params={"q": "CHECK"})
    ).json()
    assert [v["value"] for v in found["values"]] == ["/api/checkout"]
    status = (await api.get(f"/api/data/datasets/{dataset_id}/filters/status/values")).json()
    assert all(isinstance(v["value"], str) for v in status["values"])
    missing = await api.get(f"/api/data/datasets/{dataset_id}/filters/nope/values")
    assert missing.status_code == 404


async def test_widget_crud_and_validation(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app)
    base = f"/api/data/datasets/{dataset_id}/widgets"
    auto = (await api.get(base)).json()

    invalid = await api.post(
        base,
        json={
            "spec": {
                "chartType": "line",
                "title": " ",
                "x": "region",
                "aggregation": "sum",
                "y": "region",
                "split": "nope",
            }
        },
    )
    assert invalid.status_code == 422
    assert invalid.json()["errors"] == {
        "title": "Give the chart a title.",
        "x": "This column can't be used on this chart's x axis.",
        "y": "Only number columns can be summed or averaged.",
        "split": "Unknown column.",
    }
    no_type = await api.post(base, json={"spec": {"title": "x"}})
    assert no_type.json()["errors"] == {"chartType": "Choose a chart type."}

    spec = {
        "chartType": "histogram",
        "title": "  Quantity  ",
        "x": "quantity",
        "y": "revenue",
        "aggregation": "sum",
    }
    created = await api.post(base, json={"spec": spec})
    assert created.status_code == 201
    widget = created.json()
    assert widget["kind"] == "custom"
    assert widget["position"] == len(auto)
    assert widget["spec"] == {
        "chartType": "histogram",
        "title": "Quantity",
        "x": "quantity",
        "aggregation": "count",
    }

    line = {"chartType": "line", "title": "Units", "x": "order_date", "y": "quantity"}
    updated = await api.request(
        "PATCH", f"{base}/{widget['id']}", json={"spec": {**line, "aggregation": "avg"}}
    )
    assert updated.json()["spec"]["timeGrain"] == "month"

    built_in = await api.request("PATCH", f"{base}/{auto[0]['id']}", json={"spec": spec})
    assert built_in.status_code == 409
    assert built_in.json()["title"] == "Built-in chart"

    assert (await api.request("DELETE", f"{base}/{auto[0]['id']}")).status_code == 204
    assert (await api.request("DELETE", f"{base}/{widget['id']}")).status_code == 204
    assert (await api.request("DELETE", f"{base}/{widget['id']}")).status_code == 404
    assert len((await api.get(base)).json()) == len(auto) - 1


async def test_type_override_rebuilds_auto_widgets_and_keeps_custom(api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app)
    base = f"/api/data/datasets/{dataset_id}"
    custom = (
        await api.post(
            f"{base}/widgets",
            json={
                "spec": {"chartType": "bar", "title": "Mine", "x": "region", "aggregation": "count"}
            },
        )
    ).json()
    columns = (await api.get(base)).json()["columns"]
    region = next(c for c in columns if c["name"] == "region")

    await api.request("PATCH", f"{base}/columns/{region['id']}", json={"type": "text"})
    widgets = (await api.get(f"{base}/widgets")).json()
    assert all(w["spec"].get("x") != "region" for w in widgets if w["kind"] == "auto")
    assert widgets[-1]["id"] == custom["id"]
    assert widgets[-1]["position"] == len(widgets) - 1

    rows = (await api.get(f"{base}/rows", params={"pageSize": "25"})).json()
    assert isinstance(rows["rows"][0]["region"], str)


async def test_analytics_are_private(api: Api, other_api: Api, app: Any) -> None:
    dataset_id = await ready_sample(api, app, "saas")
    for method, path in (
        ("GET", "dashboard"),
        ("GET", "rows"),
        ("GET", "widgets"),
        ("GET", "filters/plan/values"),
    ):
        response = await other_api.request(method, f"/api/data/datasets/{dataset_id}/{path}")
        assert response.status_code == 404
    query = await other_api.post(
        f"/api/data/datasets/{dataset_id}/query", json={"widgets": [], "filters": {}}
    )
    assert query.status_code == 404
