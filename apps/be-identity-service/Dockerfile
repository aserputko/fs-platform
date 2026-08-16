# syntax=docker/dockerfile:1
# Build context is the monorepo root: docker build -f apps/be-identity-service/Dockerfile .

FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Reduce the monorepo to this service and its workspace dependencies.
FROM base AS pruner
COPY . .
RUN npx --yes turbo@2 prune @fs-platform/be-identity-service --docker

# Full tree, used only to compile.
FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN npm ci

# Runtime tree, resolved separately so no build tooling can leak into the final image.
# `--legacy-peer-deps` skips auto-installed peers: @prisma/client declares `prisma` and
# `typescript` as optional peers, which are needed for codegen but not to serve requests.
# `--omit=peer` does not drop them because npm ci reaches them from a production edge.
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
RUN npm ci --omit=dev --legacy-peer-deps

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ .
# prisma.config.ts resolves DATABASE_URL eagerly; codegen never opens a connection.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN npm run db:generate --workspace @fs-platform/be-identity-service \
  && npm run build --workspace @fs-platform/be-identity-service

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat \
  && addgroup -S nodejs -g 1001 \
  && adduser -S nestjs -u 1001 -G nodejs
# Copying the whole pruned tree preserves the workspace layout npm resolution relies on.
COPY --from=prod-deps --chown=nestjs:nodejs /app/ ./
COPY --from=builder --chown=nestjs:nodejs /app/apps/be-identity-service/dist ./apps/be-identity-service/dist
USER nestjs
EXPOSE 3001
CMD ["node", "apps/be-identity-service/dist/main.js"]
