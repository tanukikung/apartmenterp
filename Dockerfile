##############################################################################
# Apartment ERP — Dockerfile
#
# Multi-stage build:
#   Stage 1 (deps):    Install node_modules
#   Stage 2 (builder):  Generate Prisma client + build Next.js app
#   Stage 3 (runner):   Run the production app
#
# Usage:
#   docker build -t apartment-erp .
#   docker compose up -d
##############################################################################

# ── Stage 1: Install dependencies ──────────────────────────────────────────────
FROM node:20-slim AS deps

FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gzip openssl postgresql-client tzdata \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ── Stage 2: Build ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

RUN npx prisma generate

# Build Next.js (output: standalone) using the same release gate we verify locally.
RUN npx next build --no-lint

# ── Stage 3: Production runtime ───────────────────────────────────
FROM node:20-bookworm-slim AS runner
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gzip openssl postgresql-client tzdata \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs --create-home nextjs

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts/customer-healthcheck.js ./scripts/customer-healthcheck.js

# Keep the full dependency tree from the builder stage so first-boot
# migrations and seeding use the same generated Prisma client as the app bundle.
COPY --from=builder /app/node_modules ./node_modules

# Copy startup script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh \
  && mkdir -p /app/data/uploads /app/data/backups /app/data/logs \
  && chown -R nextjs:nodejs /app

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]