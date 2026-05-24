# Multi-stage Dockerfile for scraper worker
# Built on Playwright official image to have all browser deps preinstalled.
FROM mcr.microsoft.com/playwright:v1.49.1-jammy AS base
WORKDIR /app

# Enable corepack + pnpm
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# ---- deps stage ----
FROM base AS deps
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile --filter @cr/worker... --filter @cr/shared

# ---- build stage ----
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/worker apps/worker
COPY tsconfig.base.json ./
RUN pnpm --filter @cr/worker build

# ---- runtime stage ----
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=4000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared ./packages/shared
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/

WORKDIR /app/apps/worker
EXPOSE 4000
USER pwuser
CMD ["node", "dist/server.js"]
