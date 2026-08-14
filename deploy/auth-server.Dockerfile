# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/auth-server ./apps/auth-server
COPY types ./types

RUN pnpm install --frozen-lockfile

# Build workspace deps that the server imports at runtime
RUN pnpm --filter @shatteredarchive/types-server build

RUN pnpm --filter @shatteredarchive/auth-server... build

# node 26.3.1-alpine3.24
FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS runtime
RUN apk --no-cache upgrade
WORKDIR /repo

ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

ENV NODE_ENV=production
ENV PORT=62000
# DATA_ENCRYPTION_KEY_FILE / DATA_DIR are deliberately NOT set here — the compose
# service supplies them (mounted secret volume + data volume, see docker-compose*.yml).

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY --from=build /repo/apps/auth-server ./apps/auth-server
COPY --from=build /repo/types ./types

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/auth-server...

EXPOSE 62000
CMD ["node", "apps/auth-server/dist/index.js"]
