# node 26.12.1-alpine3.24
FROM node:26.12.1-alpine3.24@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack@0.36.0 && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/scrum-poker-client ./apps/scrum-poker-client
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
COPY apps/scrum-poker-server/package.json ./apps/scrum-poker-server/package.json
COPY apps/simulacrum-server/package.json ./apps/simulacrum-server/package.json
COPY apps/soulsteel-client/package.json ./apps/soulsteel-client/package.json
COPY apps/soulsteel-server/package.json ./apps/soulsteel-server/package.json
COPY apps/web-client/package.json ./apps/web-client/package.json
COPY apps/web-server/package.json ./apps/web-server/package.json

RUN pnpm install --frozen-lockfile

# The ONLY build-time configuration this client has: the single ad placement. Both must be
# set for the slot to render at all — with either missing nothing renders and the page makes
# no request to any ad network (see src/features/shared/AdSlot.tsx, which also explains why
# the unreachable loader code cannot be tree-shaken out of the bundle).
# Everything else (API + websocket) uses same-origin relative URLs that the edge nginx routes.
ARG VITE_AD_CLIENT=""
ARG VITE_AD_SLOT=""
ENV VITE_AD_CLIENT=${VITE_AD_CLIENT}
ENV VITE_AD_SLOT=${VITE_AD_SLOT}

# Forces the placeholder box regardless of the two args above (see AdSlot.tsx) — set "true" by
# the dev/experimental compose so that stack can never ship real ad code, even if the two args
# above are overridden with real credentials to test the wiring locally. Left empty (falsy) by
# the prod compose, where a configured slot is meant to actually serve.
ARG VITE_SP_DEV=""
ENV VITE_SP_DEV=${VITE_SP_DEV}

# Google Analytics 4 measurement id. Same all-or-nothing contract as the ad args above: empty
# (the default) means no gtag script is injected, no cookie is set and no request is made to
# Google. See apps/scrum-poker-client/src/features/shared/analytics.ts — in particular why it
# pins cookie_domain to the exact hostname rather than letting GA4 scope `_ga` to the whole
# registrable domain, which would send it to auth.shatteredarchive.dev too.
#
# Enabling this ALSO needs NGINX_CSP_SCRUM_FILE=security-headers-ads.conf on the edge, which
# is what allowlists googletagmanager.com; the strict profile blocks the loader outright.
ARG VITE_GA_ID=""
ENV VITE_GA_ID=${VITE_GA_ID}

RUN pnpm --filter @shatteredarchive/scrum-poker-client... build

# nginx 1.31.6-alpine3.24
FROM nginx:1.31.6-alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/scrum-poker-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/scrum-poker-client/dist /usr/share/nginx/html/

EXPOSE 80
