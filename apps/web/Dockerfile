# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
# Node's happy-eyeballs gives each address only 250ms, which times out on
# high-latency links inside Docker (npm/pnpm fail with ETIMEDOUT).
ENV NODE_OPTIONS=--network-family-autoselection-attempt-timeout=5000
RUN apk add --no-cache libc6-compat \
  && npm install -g pnpm@12.4.2
ENV NEXT_TELEMETRY_DISABLED=1 \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH
WORKDIR /app

# Development: source is bind-mounted by docker-compose; dependencies live in
# named volumes so the Linux node_modules never mix with the host's. The
# filtered install (web...) keeps other workspace packages untouched.
# Uses webpack (dev:docker) because Turbopack cannot poll for file changes,
# and bind mounts from Windows/macOS hosts do not deliver file events.
FROM base AS dev
EXPOSE 3000
CMD ["sh", "-c", "pnpm install --frozen-lockfile --filter web... --store-dir /pnpm-store && pnpm --filter web dev:docker"]
