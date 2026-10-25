# node 26.12.1-alpine3.24
FROM node:26.12.1-alpine3.24@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack@0.36.0 && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/soulsteel-client ./apps/soulsteel-client
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
COPY apps/mud-builder-client/package.json ./apps/mud-builder-client/package.json
COPY apps/mud-builder-server/package.json ./apps/mud-builder-server/package.json
COPY apps/psd-viewer-client/package.json ./apps/psd-viewer-client/package.json
COPY apps/psd-viewer-server/package.json ./apps/psd-viewer-server/package.json
COPY apps/scrum-poker-client/package.json ./apps/scrum-poker-client/package.json
COPY apps/scrum-poker-server/package.json ./apps/scrum-poker-server/package.json
COPY apps/simulacrum-server/package.json ./apps/simulacrum-server/package.json
COPY apps/soulsteel-server/package.json ./apps/soulsteel-server/package.json
COPY apps/web-client/package.json ./apps/web-client/package.json
COPY apps/web-server/package.json ./apps/web-server/package.json

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

# nginx 1.31.6-alpine3.24
FROM nginx:1.31.6-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/soulsteel-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/soulsteel-client/dist /usr/share/nginx/html/

EXPOSE 80
