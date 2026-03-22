# ──────────────────────────────────────────────────────────────
# Apartment ERP — Production Dockerfile
# Multi-stage build: deps → builder → runner
# Uses Next.js standalone output for efficient production image
# ──────────────────────────────────────────────────────────────

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
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

# Build Next.js (output: standalone)
RUN npm run build

# ── Stage 3: Production runtime ───────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy Next.js standalone output (includes minimal node_modules)
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema + migrations (needed for migrate deploy)
COPY --from=builder /app/prisma ./prisma

# Copy CLI tools needed at runtime: prisma CLI + tsx (for seed)
# These are small additions on top of the standalone node_modules
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=deps /app/node_modules/tsx ./node_modules/tsx
COPY --from=deps /app/node_modules/typescript ./node_modules/typescript
COPY --from=deps /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=deps /app/node_modules/.bin/tsx ./node_modules/.bin/tsx

# Copy startup script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && chown -R nextjs:nodejs /app

USER nextjs

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "server.js"]
