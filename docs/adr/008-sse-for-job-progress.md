# ADR-008: Server-Sent Events for job progress

**Status:** Accepted · 2026-09-21

## Context
Users need live progress while a dataset is being ingested and analyzed. Communication is one-way (server to client).

## Decision
Use **SSE** from FastAPI (`/api/data/jobs/{id}/events`), fed by Redis pub/sub. Nginx disables buffering for that location. The client uses `fetch` with a stream reader (so it can send an Authorization header) and a reconnect that sends `Last-Event-ID`.

## Consequences
- Plain HTTP, simple to proxy, with automatic reconnect semantics. Simpler than WebSockets.
- Server-to-client only. If "ask your data" chat later needs streaming, it can reuse SSE.
- Needs care with proxy timeouts (heartbeat comment every 15s).
