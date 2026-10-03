# ADR-002: Fastify instead of Express

**Status:** Accepted · 2026-09-21

## Context
The original idea specified Express. The Node service handles auth now and high-frequency webhooks in v1.1, and the project pitches "high-throughput I/O".

## Decision
Use **Fastify** with TypeScript and zod type providers (`fastify-type-provider-zod`), plus `@fastify/swagger` for OpenAPI output.

## Consequences
- Roughly 2x Express throughput in benchmarks. Schema-based validation and serialization come built in.
- The route schemas generate OpenAPI, which feeds `packages/api-types` (end-to-end type safety).
- The plugin/encapsulation model is less familiar than Express middleware.
