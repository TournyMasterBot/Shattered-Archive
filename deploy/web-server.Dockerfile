FROM node:26.1.0-alpine3.23@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea AS build
WORKDIR /repo
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY apps/web-server ./apps/web-server
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

RUN pnpm --filter @shatteredarchive/web-server... build

FROM node:26.1.0-alpine3.23@sha256:e71ac5e964b9201072425d59d2e876359efa25dc96bb1768cb73295728d6e4ea AS runtime
RUN apk --no-cache upgrade
WORKDIR /repo

COPY deploy/.env /repo/.env
ENV COREPACK_ENABLE_STRICT=1
RUN npm install -g corepack && corepack enable

ENV NODE_ENV=production
ENV PORT=41000

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY --from=build /repo/apps/web-server ./apps/web-server
COPY --from=build /repo/types ./types
COPY --from=build /repo/utils ./utils
COPY --from=build /repo/services ./services
COPY --from=build /repo/sdks ./sdks

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/web-server...

# Ensure offline fallback is discoverable at /repo/src/offline (a checked candidate path)
RUN mkdir -p /repo/src \
 && ln -sf /repo/apps/web-server/src/offline /repo/src/offline

EXPOSE 41000
CMD ["node", "apps/web-server/dist/index.js"]