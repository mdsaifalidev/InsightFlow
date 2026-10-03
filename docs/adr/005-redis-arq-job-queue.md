# ADR-005: Redis + ARQ job queue

**Status:** Accepted · 2026-09-21

## Context
The original design used a "background thread" in FastAPI for parsing and LLM calls. That work is lost on restart, has no retries, and cannot scale beyond one process.

## Decision
Use **Redis + ARQ** (asyncio-native Python queue) with a separate `data-worker` container. Redis pub/sub also carries job progress. **BullMQ** is reserved for Node webhook ingestion in v1.1.

## Consequences
- Durable jobs, retries with backoff, and independently scalable workers. Shows a real distributed-system design.
- One more container (Redis) and one more process (worker).
- ARQ is lighter than Celery, and less known. Accepted for its async fit with FastAPI.
