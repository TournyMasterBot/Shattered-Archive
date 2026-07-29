# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/kingdom-tactics-server ./apps/kingdom-tactics-server
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

# Build workspace deps that the server imports at runtime
RUN pnpm --filter @shatteredarchive/types-global build
RUN pnpm --filter @shatteredarchive/types-server build
RUN pnpm --filter @shatteredarchive/utils-global build
RUN pnpm --filter @shatteredarchive/utils-server build
RUN pnpm --filter @shatteredarchive/services-server build
RUN pnpm --filter @shatteredarchive/kingdom-tactics-engine build

RUN pnpm --filter @shatteredarchive/kingdom-tactics-server... build

# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS runtime
RUN apk --no-cache upgrade
WORKDIR /repo

# index.ts's dotenv bootstrap requires a base .env file to exist (mirrors game-server's own
# bootstrap it was modeled on) — intentionally minimal, real per-service config comes from
# docker-compose's `environment:` block, not this file.
COPY deploy/.env /repo/.env

ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

ENV NODE_ENV=production
ENV PORT=51000

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY --from=build /repo/apps/kingdom-tactics-server ./apps/kingdom-tactics-server
COPY --from=build /repo/types ./types
COPY --from=build /repo/utils ./utils
COPY --from=build /repo/services ./services
COPY --from=build /repo/sdks ./sdks

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/kingdom-tactics-server...

EXPOSE 51000
CMD ["node", "apps/kingdom-tactics-server/dist/index.js"]
