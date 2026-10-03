"""Shared helpers: a fresh account on the running stack (through the gateway)."""

import os
import statistics
import uuid

import httpx

BASE_URL = os.environ.get("BENCH_BASE_URL", "http://localhost:8080")


def signed_in_client(timeout: float = 120.0) -> httpx.Client:
    client = httpx.Client(base_url=BASE_URL, timeout=timeout)
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Benchmark",
            "email": f"bench-{uuid.uuid4().hex[:10]}@insightflow.dev",
            "password": f"bench-{uuid.uuid4().hex}",
        },
    )
    response.raise_for_status()
    client.headers["Authorization"] = f"Bearer {response.json()['accessToken']}"
    return client


def percentile(values: list[float], q: float) -> float:
    """Linear-interpolated percentile (q in 0..100)."""
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    return statistics.quantiles(ordered, n=100, method="inclusive")[round(q) - 1]
