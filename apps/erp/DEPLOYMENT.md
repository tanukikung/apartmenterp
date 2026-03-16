# Apartment ERP — VPS Production Deployment Guide

## Server Requirements
- OS: Ubuntu 22.04 LTS (or Debian 12)
- CPU/RAM: 2 vCPU / 4 GB RAM (minimum)
- Disk: 40 GB SSD
- Network: Ports 80/443 (HTTP/HTTPS), 3000 (app), 5432 (Postgres), 6379 (Redis)
- Software: Docker >= 24, Docker Compose Plugin, OpenSSL, ufw

## Pre‑Install
```bash
sudo apt update && sudo apt -y install ca-certificates curl gnupg ufw
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
newgrp docker
```

## Clone and Configure
```bash
git clone <your-repo-url> apartment_erp && cd apartment_erp/apps/erp
cp .env.production .env.production.local
```

Set required envs in .env.production.local:
- DATABASE_URL=postgresql://postgres:postgres@postgres:5432/apartment_erp?schema=public
- NEXTAUTH_SECRET=$(openssl rand -hex 32)
- NEXTAUTH_URL=https://your-domain.com
- LINE_CHANNEL_ID=...
- LINE_CHANNEL_SECRET=...
- LINE_ACCESS_TOKEN=... (or LINE_CHANNEL_ACCESS_TOKEN)
- APP_BASE_URL=https://your-domain.com
- CRON_SECRET=$(openssl rand -hex 32)
- REDIS_URL=redis://redis:6379
- NODE_ENV=production

Optionally, set CRON_ENABLED=true to run background jobs.

## Build and Run (Docker Compose)
```bash
docker compose pull
docker compose build --no-cache
docker compose up -d
```

App runs on http://localhost:3000 (reverse proxy with Nginx/Traefik recommended).

## Database Migrations
Run inside the app container after first start:
```bash
docker compose exec app npx prisma migrate deploy
docker compose exec app npx prisma generate
```

## Health and Metrics
- /api/health — environment & DB connectivity
- /api/metrics — DB status, memory, CPU, uptime

## Logs
- Pino logs are written to /logs in the container and mapped to the "logs" volume.
```bash
docker compose logs -f app
```

## Backups
Postgres
```bash
DATE=$(date +%F)
docker compose exec -T postgres pg_dump -U postgres apartment_erp | gzip > pg_backup_$DATE.sql.gz
```
Store backups off‑site and rotate.

### Backup Scheduler Service
- A dedicated `backup-scheduler` service runs scheduled backups using `BACKUP_CRON` (default `0 3 * * *`) and writes to `BACKUP_DIR` (mapped to `backups` volume).
- Manual trigger endpoint (requires ADMIN role cookie or `x-cron-secret` header equal to `CRON_SECRET`):
```bash
curl -X POST http://YOUR_HOST/api/system/backup/run \
  -H 'x-cron-secret: '"$CRON_SECRET"
```
### Restore Drill
1. Copy a `.sql.gz` backup into the app container or accessible path.
2. Run restore (requires `DATABASE_URL` in env):
```bash
docker compose exec app node dist/scripts/restore-db.js /path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz
```
Validate application health and metrics after restore.

## Nginx (Production Reverse Proxy)
Example config for TLS termination and reverse proxy to the app on port 3000:
```
server {
  listen 80;
  server_name example.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name example.com;

  ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  gzip on;
  gzip_types text/plain application/json text/css application/javascript;

  location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://app:3000;
    proxy_read_timeout 60s;
  }
}
```

### SSL Notes
- Use Let's Encrypt with certbot inside host or companion container to provision certificates.
- Renewals should reload Nginx gracefully: `nginx -s reload`.
- Ensure strong DH params and modern TLS configuration for your security policy.

## Security
- Firewall: allow 80/443 only; restrict 3000/5432/6379 to internal network
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```
- Ensure strong secrets in .env.production.local
- TLS termination with Nginx/Traefik
- Rate limiting, CSRF, and security headers enforced via middleware

## Background Jobs
- Enabled via CRON_ENABLED=true
- Jobs:
  - Monthly billing generation (3:00 on day 1)
  - Overdue invoice check (4:00 daily)
  - LINE reminder sender (8:00 daily)
- Protected admin triggers can include header: x-cron-secret: $CRON_SECRET

## Updating
```bash
git pull
docker compose build
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

## Troubleshooting
- Check /api/health and /api/metrics
- Inspect logs: docker compose logs -f app postgres redis
- Verify environment variables and database connectivity
