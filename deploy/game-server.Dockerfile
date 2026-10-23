FROM node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build
RUN apk --no-cache upgrade
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack@0.36.0 && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/game-server ./apps/game-server
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
COPY apps/mud-builder-client/package.json ./apps/mud-builder-client/package.json
COPY apps/mud-builder-server/package.json ./apps/mud-builder-server/package.json
COPY apps/psd-viewer-client/package.json ./apps/psd-viewer-client/package.json
COPY apps/psd-viewer-server/package.json ./apps/psd-viewer-server/package.json
COPY apps/scrum-poker-client/package.json ./apps/scrum-poker-client/package.json
COPY apps/scrum-poker-server/package.json ./apps/scrum-poker-server/package.json
COPY apps/simulacrum-server/package.json ./apps/simulacrum-server/package.json
COPY apps/soulsteel-client/package.json ./apps/soulsteel-client/package.json
COPY apps/soulsteel-server/package.json ./apps/soulsteel-server/package.json
COPY apps/web-client/package.json ./apps/web-client/package.json
COPY apps/web-server/package.json ./apps/web-server/package.json

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

FROM node:26.10.0-alpine3.24@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS runtime
RUN apk --no-cache upgrade
WORKDIR /repo

COPY deploy/.env /repo/.env
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack@0.36.0 && corepack enable

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
COPY apps/soulsteel-client/package.json ./apps/soulsteel-client/package.json
COPY apps/soulsteel-server/package.json ./apps/soulsteel-server/package.json
COPY apps/web-client/package.json ./apps/web-client/package.json
COPY apps/web-server/package.json ./apps/web-server/package.json
COPY sdks/sdks-client/package.json ./sdks/sdks-client/package.json
COPY sdks/sdks-server/package.json ./sdks/sdks-server/package.json
COPY services/merc-area/package.json ./services/merc-area/package.json
COPY services/scrum-poker-core/package.json ./services/scrum-poker-core/package.json
COPY services/services-server/package.json ./services/services-server/package.json
COPY types/types-client/package.json ./types/types-client/package.json
COPY types/types-global/package.json ./types/types-global/package.json
COPY types/types-server/package.json ./types/types-server/package.json
COPY utils/utils-client/package.json ./utils/utils-client/package.json
COPY utils/utils-global/package.json ./utils/utils-global/package.json
COPY utils/utils-server/package.json ./utils/utils-server/package.json

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/game-server...

EXPOSE 31000
CMD ["node", "apps/game-server/dist/index.js"]