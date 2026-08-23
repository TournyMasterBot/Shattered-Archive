# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/simulacrum-server ./apps/simulacrum-server
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

RUN pnpm --filter @shatteredarchive/simulacrum-server... build

# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS runtime
RUN apk --no-cache upgrade
# docker CLI + compose v2 plugin — engine-rebuild.ts shells out to `docker compose` to rebuild
# ONLY the merc-mud engine container. Meaningless without the docker.sock (proxied, never
# mounted raw — see deploy/docker-compose*.yml's simulacrum-docker-proxy service) that the
# compose files add alongside this. Mirrors mud-builder-server.Dockerfile's identical line.
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /repo

# index.ts's dotenv bootstrap only WARNS when this is missing, but the base file keeps the
# boot log clean and matches soulsteel-server's runtime stage. Real per-service config
# comes from docker-compose's `environment:` block, not this file.
COPY deploy/.env /repo/.env

ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

ENV NODE_ENV=production
ENV PORT=65000

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY --from=build /repo/apps/simulacrum-server ./apps/simulacrum-server
COPY --from=build /repo/types ./types
COPY --from=build /repo/utils ./utils
COPY --from=build /repo/services ./services
COPY --from=build /repo/sdks ./sdks

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/simulacrum-server...

EXPOSE 65000
EXPOSE 65001
CMD ["node", "apps/simulacrum-server/dist/index.js"]
