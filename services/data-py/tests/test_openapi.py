"""The OpenAPI spec is the source for the web app's types (packages/api-types),
so it has to describe real shapes — not bare dicts.
"""

from typing import Any

from app.main import create_app


def spec() -> dict[str, Any]:
    return create_app().openapi()


def test_describes_every_route() -> None:
    paths = spec()["paths"]
    for path in (
        "/api/data/datasets",
        "/api/data/datasets/{dataset_id}",
        "/api/data/datasets/{dataset_id}/dashboard",
        "/api/data/datasets/{dataset_id}/query",
        "/api/data/datasets/{dataset_id}/rows",
        "/api/data/datasets/{dataset_id}/widgets",
        "/api/data/datasets/{dataset_id}/insights/latest",
        "/api/data/jobs/{job_id}/events",
    ):
        assert path in paths, path


def test_responses_reference_named_schemas() -> None:
    document = spec()
    schemas = document["components"]["schemas"]
    for name in ("Dataset", "DashboardResponse", "Insight", "Problem", "JobProgressEvent"):
        assert name in schemas, name

    ok = document["paths"]["/api/data/datasets/{dataset_id}"]["get"]["responses"]["200"]
    assert ok["content"]["application/json"]["schema"]["$ref"].endswith("DatasetDetail")
    dataset = schemas["Dataset"]["properties"]
    # camelCase on the wire, and whole numbers stay whole.
    assert "rowCount" in dataset and "row_count" not in dataset
    assert schemas["Kpi"]["properties"]["value"]["anyOf"][0]["type"] == "integer"


def test_errors_are_documented() -> None:
    responses = spec()["paths"]["/api/data/datasets/{dataset_id}"]["get"]["responses"]
    assert "404" in responses
    assert responses["404"]["content"]["application/json"]["schema"]["$ref"].endswith("Problem")
