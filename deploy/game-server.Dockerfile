FROM node:24.15.0-alpine3.23@sha256:d1b3b4da11eefd5941e7f0b9cf17783fc99d9c6fc34884a665f40a06dbdfc94f AS build
WORKDIR /repo
RUN corepack enable

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

FROM node:24-alpine AS runtime
RUN apk --no-cache upgrade
WORKDIR /repo

COPY deploy/.env /repo/.env
RUN corepack enable

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