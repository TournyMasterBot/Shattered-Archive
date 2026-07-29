# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/kingdom-tactics-client ./apps/kingdom-tactics-client
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

# No VITE_KT_API/VITE_KT_WS build args: this deploys single-subdomain (see
# features/auth/kt-auth-config.ts) — the edge nginx proxies /api/kt and /ws/kt on kt-client's
# OWN subdomain back to kt-server, so the client calls relative paths in both dev and prod.
RUN pnpm --filter @shatteredarchive/kingdom-tactics-client... build

# nginx 1.31.2-alpine3.23
FROM nginx:1.31.2-alpine@sha256:81595dd77c2cc4ec66c6721daa3c13b6a1f7bb3a8a2cd3247a874e3bd5c39dd2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/kingdom-tactics-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/kingdom-tactics-client/dist /usr/share/nginx/html/

EXPOSE 80
