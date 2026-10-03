# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
# See apps/web/Dockerfile: npm/pnpm time out on this network without it.
ENV NODE_OPTIONS=--network-family-autoselection-attempt-timeout=5000
RUN npm install -g pnpm@12.4.2
WORKDIR /app

# Development: the repo is bind-mounted by docker-compose; dependencies live
# in named volumes. Migrations run before the watcher starts.
FROM base AS dev
EXPOSE 4000
CMD ["sh", "-c", "pnpm install --frozen-lockfile --filter @insightflow/auth-node... --store-dir /pnpm-store && pnpm --filter @insightflow/auth-node db:migrate && pnpm --filter @insightflow/auth-node dev"]

# Production image: build with tsup, then run plain node.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile --filter @insightflow/auth-node... \
  && pnpm --filter @insightflow/auth-node build \
  && pnpm deploy --filter @insightflow/auth-node --prod /out

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /app/services/auth-node/dist ./dist
COPY --from=build /app/services/auth-node/drizzle ./drizzle
USER node
EXPOSE 4000
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
