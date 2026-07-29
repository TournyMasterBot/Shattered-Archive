# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/scrum-poker-client ./apps/scrum-poker-client
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

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

RUN pnpm --filter @shatteredarchive/scrum-poker-client... build

# nginx 1.31.2-alpine3.23
FROM nginx:1.31.2-alpine@sha256:81595dd77c2cc4ec66c6721daa3c13b6a1f7bb3a8a2cd3247a874e3bd5c39dd2 AS runtime
RUN apk --no-cache upgrade
RUN rm -f /etc/nginx/conf.d/default.conf
COPY deploy/nginx/scrum-poker-client.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/scrum-poker-client/dist /usr/share/nginx/html/

EXPOSE 80
