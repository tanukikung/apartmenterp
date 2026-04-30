# Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- PostgreSQL 15+
- Redis (optional, falls back to in-memory)

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
DATABASE_URL="postgresql://user:password@host:5432/db"
NEXTAUTH_SECRET="your-secret-here"           # openssl rand -base64 32
NEXTAUTH_URL="https://your-domain.com"
APP_BASE_URL="https://your-domain.com"

# File access secrets
INVOICE_ACCESS_SECRET="..."
FILE_ACCESS_SECRET="..."
AUTH_SECRET="..."

# LINE Messaging API (optional)
LINE_CHANNEL_SECRET="..."
LINE_CHANNEL_ACCESS_TOKEN="..."

# Sentry (optional)
SENTRY_DSN="..."

# CORS (production only)
ALLOWED_ORIGINS="https://your-domain.com"

# Prometheus metrics (optional, Bearer token auth)
METRICS_TOKEN="..."

# Cron / Outbox
CRON_ENABLED=true
OUTBOX_ENABLED=true
```

## Docker Deployment

### 1. Build the image

```bash
docker build -t apartment-erp .
```

Or use the production-optimized Dockerfile in `deploy/`:

```bash
docker build -t apartment-erp -f deploy/Dockerfile .
```

### 2. Run with Docker Compose

```bash
# Development stack (all-in-one: DB + Redis + monitoring + app)
docker compose up -d

# Modular production deployment
docker network create apartment_net
docker compose -f docker-compose.db.yml up -d          # DB + Redis only
docker compose -f docker-compose.app.yml up -d          # App only (connects to db.yml network)

# Self-contained production (DB + App in one)
docker compose -f deploy/docker-compose.prod.yml up -d
```

### 3. Run migrations

> Note: `deploy/docker-compose.prod.yml` runs migrations automatically on startup.

```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma db seed   # first run only
```

## Database Migrations

```bash
# Development
npx prisma migrate dev

# Production
npx prisma migrate deploy
```

## Backup Strategy

The backup cron job runs at `BACKUP_CRON` (default: `0 3 * * *` — daily at 3 AM).

Configure backup destination:

```bash
# Local file system
BACKUP_DIR="/var/backups/apartment-erp"

# S3 (optional)
BACKUP_S3_BUCKET="your-bucket-name"
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
```

## Health Checks

```bash
# Basic health
curl https://your-domain.com/api/health

# Deep health (admin only)
curl -H "Cookie: ..." https://your-domain.com/api/health/deep

# Prometheus metrics (Bearer token auth)
curl -H "Authorization: Bearer $METRICS_TOKEN" https://your-domain.com/api/metrics
```

## Cron Jobs

Cron jobs run inside the application process via `node-cron`. This works in:

- **Self-hosted** (Docker, VPS): ✅ supported
- **Vercel serverless**: ❌ NOT supported — use `vercel.json` cron jobs instead

Set `CRON_ENABLED=false` to disable the built-in cron scheduler.

## LINE Messaging Setup

1. Create a LINE Messaging API channel at [LINE Developers Console](https://developers.line.biz/)
2. Enable Webhook URL: `https://your-domain.com/api/line/webhook`
3. Set environment variables:
   - `LINE_CHANNEL_SECRET`
   - `LINE_CHANNEL_ACCESS_TOKEN`
4. Optional: Enable LINE Login for tenant portal

## Reverse Proxy (Caddy example)

```Caddyfile
erp.yourdomain.com {
    reverse_proxy localhost:3001
    tls your@email.com
}
```

Or nginx:

```nginx
server {
    listen 443 ssl;
    server_name erp.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
