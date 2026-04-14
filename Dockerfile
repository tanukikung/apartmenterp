# ──────────────────────────────────────────────────────────────
# Apartment ERP — Production Dockerfile
# Multi-stage build: deps → builder → runner
# Uses Next.js standalone output for efficient production image
# ──────────────────────────────────────────────────────────────

FROM node:20-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gzip openssl postgresql-client tzdata \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ── Stage 1: Install all dependencies ────────────────────────────
FROM base AS deps
COPY package.json package-lock.json* ./
# Install ALL deps (including devDeps for tsx, prisma CLI)
RUN npm ci

# ── Stage 2: Build Next.js application ───────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client for production
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

# Copy Next.js standalone output (includes minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + migrations (needed for migrate deploy)
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

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
