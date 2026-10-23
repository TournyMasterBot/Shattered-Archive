# node 26.10.0-alpine3.24
FROM node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack@0.36.0 && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/mud-builder-client ./apps/mud-builder-client
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

# pnpm 11.28+ and 12 refuse a frozen install when pnpm-lock.yaml lists a workspace project whose package.json is missing: manifests of the projects this stage does not copy in full.
COPY apps/auth-client/package.json ./apps/auth-client/package.json
COPY apps/auth-server/package.json ./apps/auth-server/package.json
COPY apps/dsl-color-preview/package.json ./apps/dsl-color-preview/package.json
COPY apps/dsl-log-preview/package.json ./apps/dsl-log-preview/package.json
COPY apps/game-client/package.json ./apps/game-client/package.json
COPY apps/game-server/package.json ./apps/game-server/package.json
COPY apps/mud-builder-server/package.json ./apps/mud-builder-server/package.json
COPY apps/psd-viewer-client/package.json ./apps/psd-viewer-client/package.json
COPY apps/psd-viewer-server/package.json ./apps/psd-viewer-server/package.json
COPY apps/scrum-poker-client/package.json ./apps/scrum-poker-client/package.json
COPY apps/scrum-poker-server/package.json ./apps/scrum-poker-server/package.json
COPY apps/simulacrum-server/package.json ./apps/simulacrum-server/package.json
COPY apps/soulsteel-client/package.json ./apps/soulsteel-client/package.json
COPY apps/soulsteel-server/package.json ./apps/soulsteel-server/package.json
COPY apps/web-client/package.json ./apps/web-client/package.json
COPY apps/web-server/package.json ./apps/web-server/package.json

RUN pnpm install --frozen-lockfile

# The client calls /api and /health with relative URLs at runtime (the vite proxy
# is dev-only), so no VITE_* build args are needed — the edge nginx routes them.
RUN pnpm --filter @shatteredarchive/mud-builder-client... build

# nginx 1.31.6-alpine3.24
FROM nginx:1.31.6-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/mud-builder-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/mud-builder-client/dist /usr/share/nginx/html/

EXPOSE 80
