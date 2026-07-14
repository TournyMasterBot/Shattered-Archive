FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS build
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/game-server ./apps/game-server
COPY types ./types
COPY utils ./utils
COPY services ./services
COPY sdks ./sdks

RUN pnpm install --frozen-lockfile

# Build workspace deps that the server imports at runtime
RUN pnpm --filter @shatteredarchive/types-global build
RUN pnpm --filter @shatteredarchive/types-server build
RUN pnpm --filter @shatteredarchive/utils-global build
RUN pnpm --filter @shatteredarchive/utils-server build
RUN pnpm --filter @shatteredarchive/services-server build
RUN pnpm --filter @shatteredarchive/sdks-server build

# Build the server itself (and any remaining deps)
RUN pnpm --filter @shatteredarchive/game-server... build

FROM node:26.3.1-alpine3.24@sha256:a2dc166a387cc6ca1e62d0c8e265e49ca985d6e60abc9fe6e6c3d6ce8e63f606 AS runtime
RUN apk --no-cache upgrade
WORKDIR /repo

COPY deploy/.env /repo/.env
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

ENV NODE_ENV=production
ENV PORT=31000

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

# Copy built workspace packages + the server app
COPY --from=build /repo/apps/game-server ./apps/game-server
COPY --from=build /repo/types ./types
COPY --from=build /repo/utils ./utils
COPY --from=build /repo/services ./services
COPY --from=build /repo/sdks ./sdks

# Install production deps for the filtered workspace (this links workspace packages).
RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/game-server...

EXPOSE 31000
CMD ["node", "apps/game-server/dist/index.js"]