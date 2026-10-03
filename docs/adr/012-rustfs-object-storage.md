# ADR-012: RustFS as local S3-compatible storage

**Status:** Accepted · 2026-09-22

## Context
ADR-011 stores raw uploads and Parquet in S3-compatible object storage, and the original plan used MinIO locally. MinIO stopped publishing community binaries and Docker images in October 2025, then put the repository into maintenance mode and archived it (2026). A pinned old image would receive no fixes.

## Decision
Use **RustFS** (`rustfs/rustfs`, Apache 2.0, pinned to `1.0.0`) as the local object store. It is a single container with an S3 API on `:9000` and a web console on `:9001`, configured with `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`. A one-shot `amazon/aws-cli` container (`rustfs-init`) creates the buckets idempotently.

Application code talks only to the generic S3 API through env config (`S3_ENDPOINT`, `S3_ACCESS_KEY`, …). Production uses Cloudflare R2 or AWS S3.

## Alternatives considered
- **SeaweedFS**: mature, but more involved configuration and no polished console.
- **Garage**: very stable and tiny, but buckets and keys must be created through its CLI, and S3 coverage is narrower.
- **Chainguard-built MinIO images**: keeps MinIO, but depends on a third party rebuilding an unmaintained upstream.

## Consequences
- MinIO-like developer experience with an actively maintained, permissively licensed project.
- RustFS is young (1.0 in Sep 2026). If it causes problems, swapping to SeaweedFS or Garage only changes `docker-compose.yml`, not application code.
- aws-cli v2 sends newer checksum headers by default. `rustfs-init` sets `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` for compatibility with S3-compatible stores.
