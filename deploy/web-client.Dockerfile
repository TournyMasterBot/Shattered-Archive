FROM node:26.1.0-alpine3.23@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea AS build
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/web-client ./apps/web-client
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

RUN pnpm --filter @shatteredarchive/web-client... build

# nginx 1.31.0-alpine
FROM nginx:alpine@sha256:dc48b7a872a79fb541ba5081d320b11b549231bc63ba465a7495afaa7d2ebcb8 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/web-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web-client/dist /usr/share/nginx/html/

EXPOSE 80
