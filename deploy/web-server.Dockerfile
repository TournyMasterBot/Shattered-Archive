FROM node:20-alpine AS build
WORKDIR /repo
RUN corepack enable

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

FROM node:20-alpine AS runtime
WORKDIR /repo

COPY deploy/.env /repo/.env
RUN corepack enable

ENV NODE_ENV=production
ENV PORT=40000

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY tsconfig*.json ./

COPY --from=build /repo/apps/web-server ./apps/web-server
COPY --from=build /repo/types ./types
COPY --from=build /repo/utils ./utils
COPY --from=build /repo/services ./services
COPY --from=build /repo/sdks ./sdks

RUN pnpm install --frozen-lockfile --prod --filter @shatteredarchive/web-server...

EXPOSE 40000
CMD ["node", "apps/web-server/dist/index.js"]