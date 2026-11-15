# syntax=docker/dockerfile:1
# ==============================================================================
# LEKALO ZHIIDE BACKEND — PRODUCTION DOCKERFILE
# NestJS 10 + Fastify Engine + Prisma ORM
# ==============================================================================

# --- Stage 1: Base Alpine Image ---
FROM node:18-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# --- Stage 2: Dependencies & Native Addon Compilation ---
FROM base AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

# Install full dependencies including devDependencies for build
RUN npm ci

# Generate Prisma Client for Linux Alpine engine
RUN npx prisma generate

# --- Stage 3: Builder ---
FROM deps AS builder
WORKDIR /app
COPY . .

# Compile TypeScript to JavaScript in dist/
RUN npm run build

# Prune devDependencies to keep only runtime dependencies
RUN npm prune --production

# --- Stage 4: Production Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Install openssl for Prisma engine runtime
RUN apk add --no-cache openssl wget

# Non-root user for container security
RUN addgroup --system --gid 1001 nestjs && \
    adduser --system --uid 1001 nestjs

# Copy runtime dependencies and compiled output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh && \
    chown -R nestjs:nestjs /app

USER nestjs

EXPOSE 4000

# Health check probe against live HTTP health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:4000/health || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
