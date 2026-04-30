# Deployment Guide

## Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local dev)
- PostgreSQL 15+ (Docker handles this automatically)
- Redis 7 (optional — app falls back to in-memory without it)

---

## Local Dev with Docker

```bash
cp .env.example .env     # fill in DATABASE_URL + NEXTAUTH_SECRET
docker network create apartment_net
docker compose up -d     # PostgreSQL + Redis + monitoring stack

npx prisma migrate dev
npx prisma db seed       # first run only

npm run dev              # app at http://localhost:3001
```

---

## Docker Compose Stacks

| Command | What it starts |
|---------|----------------|
| `docker compose up -d` | All-in-one: DB + Redis + monitoring + app |
| `docker compose -f docker-compose.db.yml up -d` | DB + Redis only |
| `docker compose -f docker-compose.app.yml up -d` | App only (connects to db.yml network) |
| `docker compose -f docker-compose.monitor.yml up -d` | Monitoring only (Prometheus + Grafana) |
| `docker compose -f deploy/docker-compose.prod.yml up -d` | Production: PostgreSQL + app in one |

### Modular Production

```bash
docker network create apartment_net
docker compose -f docker-compose.db.yml up -d
docker compose -f docker-compose.app.yml up -d
```

---

## Production Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/db
NEXTAUTH_SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://your-domain.com
APP_BASE_URL=https://your-domain.com
NODE_ENV=production
COOKIE_SECURE=true
CRON_ENABLED=true
OUTBOX_ENABLED=true
ALLOWED_ORIGINS=https://your-domain.com
```

### LINE (optional)

```env
LINE_CHANNEL_SECRET=...
LINE_ACCESS_TOKEN=...
LINE_CHANNEL_ID=...
```

### Sentry (optional)

```env
SENTRY_DSN=https://...@sentry.io/...
```

---

## Database Migrations

```bash
# Development
npx prisma migrate dev

# Production
docker compose exec app npx prisma migrate deploy
```

> `deploy/docker-compose.prod.yml` runs migrations automatically on startup.

---

## Health Checks

```bash
curl https://your-domain.com/api/health

# Admin only
curl -H "Cookie: auth_session=..." https://your-domain.com/api/health/deep

# Prometheus metrics
curl -H "Authorization: Bearer $METRICS_TOKEN" https://your-domain.com/api/metrics
```

---

## Reverse Proxy Example

**Caddy:**
```Caddyfile
erp.yourdomain.com {
    reverse_proxy localhost:3001
    tls your@email.com
}
```

**Nginx:**
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

---

## Cron Jobs

Cron runs inside the app process via `node-cron`. Set `CRON_ENABLED=false` to disable.

Supported in: Docker, VPS, self-hosted. **Not** supported in Vercel serverless (use `vercel.json` cron jobs instead).

---

## LINE Messaging Setup

1. Create a channel at https://developers.line.biz/
2. Set Webhook URL: `https://your-domain.com/api/line/webhook`
3. Add to `.env`:
   - `LINE_CHANNEL_SECRET`
   - `LINE_ACCESS_TOKEN`
