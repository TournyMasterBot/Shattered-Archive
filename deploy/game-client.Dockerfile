FROM node:24.15.0-alpine3.23@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f AS build
WORKDIR /repo
RUN corepack enable

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

FROM nginx:alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de AS runtime
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/game-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/game-client/dist /usr/share/nginx/html/

EXPOSE 80
