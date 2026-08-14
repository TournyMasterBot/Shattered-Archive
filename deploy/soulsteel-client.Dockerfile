# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/soulsteel-client ./apps/soulsteel-client
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

# Unlike scrum-poker-client, this app has no ad unit and no build-time configuration for the
# API — that is always same-origin relative paths that the edge nginx routes (see
# vite.config.ts). It does carry Google Analytics 4, on the same all-or-nothing contract as
# scrum-poker's VITE_GA_ID: empty (the default) means no gtag script is injected, no cookie is
# set and no request is made to Google. See src/features/shared/analytics.ts — in particular
# why it pins cookie_domain to the exact hostname rather than letting GA4 scope `_ga` to the
# whole registrable domain, which would send it to auth.shatteredarchive.dev too.
#
# Enabling this ALSO needs NGINX_CSP_SOULSTEEL_FILE=security-headers-analytics.conf on the
# edge, which is what allowlists googletagmanager.com; the strict profile blocks the loader
# outright. Unlike scrum-poker, there is no ad-permitting profile to reach for here — this app
# carries no ad unit, ever — so the CSP swap only ever grants analytics, never ads.
ARG VITE_GA_ID=""
ENV VITE_GA_ID=${VITE_GA_ID}

RUN pnpm --filter @shatteredarchive/soulsteel-client... build

# nginx 1.31.2-alpine3.23
FROM nginx:1.31.2-alpine@sha256:81595dd77c2cc4ec66c6721daa3c13b6a1f7bb3a8a2cd3247a874e3bd5c39dd2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/soulsteel-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/soulsteel-client/dist /usr/share/nginx/html/

EXPOSE 80
