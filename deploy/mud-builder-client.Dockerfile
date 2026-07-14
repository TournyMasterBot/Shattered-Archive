# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/mud-builder-client ./apps/mud-builder-client
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

# The client calls /api and /health with relative URLs at runtime (the vite proxy
# is dev-only), so no VITE_* build args are needed — the edge nginx routes them.
RUN pnpm --filter @shatteredarchive/mud-builder-client... build

# nginx 1.31.2-alpine3.23
FROM nginx:1.31.2-alpine@sha256:81595dd77c2cc4ec66c6721daa3c13b6a1f7bb3a8a2cd3247a874e3bd5c39dd2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/mud-builder-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/mud-builder-client/dist /usr/share/nginx/html/

EXPOSE 80
