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

RUN npm run build

# ── Stage 3: Runtime ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/lib ./src/lib
COPY --from=builder /app/src/modules ./src/modules
COPY --from=builder /app/src/app/api ./src/app/api

COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
RUN cp -r /app/node_modules/@prisma ./node_modules/@prisma 2>/dev/null || true

RUN echo '#!/bin/sh\n\
set -e\n\
echo "======================================"\n\
echo "  Apartment ERP Starting..."\n\
echo "======================================"\n\
echo "[1/3] Database migrations..."\n\
./node_modules/.bin/prisma migrate deploy || true\n\
echo "[2/3] Checking seed data..."\n\
USER_COUNT=$(node -e "\n\
const { PrismaClient } = require(\"@prisma/client\");\n\
const p = new PrismaClient();\n\
p.adminUser.count()\n\
  .then(n => { process.stdout.write(String(n)); return p.\$disconnect(); })\n\
  .catch(() => { process.stdout.write(\"0\"); });\n\
" 2>/dev/null || echo "0")\n\
if [ "${USER_COUNT:-0}" = "0" ]; then\n\
  echo "     First run — seeding database..."\n\
  ./node_modules/.bin/tsx prisma/seed.ts || true\n\
fi\n\
echo "[3/3] Starting app on port ${PORT:-3001}..."\n\
exec "$@"' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]