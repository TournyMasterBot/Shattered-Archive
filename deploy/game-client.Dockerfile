FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/game-client ./apps/game-client
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

ARG VITE_PORT
ARG VITE_WEB_API
ARG VITE_WEB_WS
ARG VITE_WEB_SECURE
ARG VITE_ENV

ENV VITE_PORT=$VITE_PORT
ENV VITE_WEB_API=$VITE_WEB_API
ENV VITE_WEB_WS=$VITE_WEB_WS
ENV VITE_WEB_SECURE=$VITE_WEB_SECURE
ENV VITE_ENV=$VITE_ENV

RUN pnpm --filter @shatteredarchive/game-client... build

# nginx 1.31.2-alpine3.23
FROM nginx:1.31.2-alpine@sha256:81595dd77c2cc4ec66c6721daa3c13b6a1f7bb3a8a2cd3247a874e3bd5c39dd2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/game-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/game-client/dist /usr/share/nginx/html/

EXPOSE 80
