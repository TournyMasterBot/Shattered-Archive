# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/mud-builder-server ./apps/mud-builder-server
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

# Build workspace deps that the server imports at runtime
RUN pnpm --filter @shatteredarchive/types-global build
RUN pnpm --filter @shatteredarchive/types-server build
RUN pnpm --filter @shatteredarchive/utils-global build
RUN pnpm --filter @shatteredarchive/services-server build
RUN pnpm --filter @shatteredarchive/merc-area build

RUN pnpm --filter @shatteredarchive/mud-builder-server... build

# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS runtime
RUN apk --no-cache upgrade
# Phase 15: docker CLI + compose v2 plugin — mounted/installed but UNUSED until Step 7's
# rebuild pipeline exists. Only meaningful alongside the docker.sock bind mount the
# experimental compose file adds for this service; the image alone grants no capability.
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /repo

ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

ENV NODE_ENV=production
ENV PORT=61000
# MERC_MUD_PATH / MERC_AREA_DIR / MUD_WRITE_ENABLED are deliberately NOT set here:
# writes stay gated off unless the experimental compose service sets them.

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY --from=build /repo/apps/mud-builder-server ./apps/mud-builder-server
COPY --from=build /repo/types ./types
COPY --from=build /repo/utils ./utils
COPY --from=build /repo/services ./services
COPY --from=build /repo/sdks ./sdks

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/mud-builder-server...

EXPOSE 61000
CMD ["node", "apps/mud-builder-server/dist/index.js"]
