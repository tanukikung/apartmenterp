# Deployment Guide

## Prerequisites

| Requirement | Version | Notes |
|------------|---------|-------|
| Node.js | 20 LTS | 18 minimum; 22 works |
| PostgreSQL | 15+ | 16 recommended; tested on 18 |
| npm | 9+ | bundled with Node 20 |
| Docker + Compose | 24+ | optional; for containerised deploy |
| OpenSSL | any | for generating secrets |

Redis is optional. The outbox processor falls back to in-process queue without it. No functionality is lost in single-instance deployments.

---

## Environment Setup

1. Copy the example env file and fill in values (see `ENV_REQUIRED.md` for every variable):

```bash
cd apps/erp
cp .env.example .env.production.local
```

2. Mandatory minimum for the app to start:

```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
NEXTAUTH_SECRET=<32-char random hex>
APP_BASE_URL=https://your-domain.com
```

Generate secrets:
```bash
openssl rand -hex 32   # use for NEXTAUTH_SECRET and CRON_SECRET
```

---

## Database Migration Steps

Run once per deployment, in order. Safe to re-run (idempotent):

```bash
# 1. Apply all migrations
npx prisma migrate deploy

# 2. Regenerate Prisma client (required after schema changes)
npx prisma generate
```

**Fresh install:** migrations are applied in order `0001` → `0007`. All 7 migrations apply cleanly on a blank database.

**Existing install / upgrade:** `prisma migrate deploy` applies only unapplied migrations. No manual SQL needed.

Do not run `prisma migrate dev` in production — it generates new migration files.

---

## Seed / Init Steps

Seed creates: 1 building, 8 floors, 239 rooms, 2 admin users (owner + staff).

```bash
npx tsx prisma/seed.ts
```

Default credentials created by seed (change immediately after first login):
- Admin: `owner` / `Owner@12345`
- Staff: `staff` / `Staff@12345`

Override passwords at seed time:
```bash
SEED_OWNER_PASSWORD=MyStrong1 SEED_STAFF_PASSWORD=MyStrong2 npx tsx prisma/seed.ts
```

**Production note:** seed is safe to re-run (uses upsert). It will not duplicate rooms. It will not overwrite an existing owner password if the user was modified after seeding.

First-user bootstrap: if the database has zero admin users, the `/sign-up` route creates the first account without requiring a signup code.

---

## Build and Start Commands

### Node (bare metal / VPS)

```bash
cd apps/erp

# Install dependencies
npm ci

# Generate Prisma client
npx prisma generate

# Build Next.js app + background workers
npm run build
npm run build:worker
npm run build:scheduler

# Run database migrations
npx prisma migrate deploy

# Start production server (port 3000)
npm run start
```

### Docker Compose (recommended)

```bash
cd apps/erp

# Build and start all services (app + postgres + redis)
docker compose build --no-cache
docker compose up -d

# Run migrations inside the running app container
docker compose exec app npx prisma migrate deploy

# (First deploy only) Seed the database
docker compose exec app npx tsx prisma/seed.ts
```

App listens on port `3000`. Place Nginx or a load balancer in front for TLS termination.

### Environment variable for Docker

Pass env vars via `.env.production` file (referenced by `env_file` in `docker-compose.yml`) or by setting them directly in the shell before running `docker compose`.

---

## Vercel Deployment Notes

The app uses `output: 'standalone'` in `next.config.js` and is compatible with Vercel.

1. Set all environment variables in the Vercel project dashboard (`Settings → Environment Variables`). Do not commit `.env` files.
2. Vercel does not run `prisma migrate deploy` automatically. Use a Vercel deploy hook or CI pipeline step to run migrations against the database before traffic is cut over:
   ```bash
   DATABASE_URL=<prod_url> npx prisma migrate deploy
   ```
3. Background cron jobs (`/api/cron/*`) must be scheduled externally (e.g., Vercel Cron, GitHub Actions, or an uptime service hitting the endpoints with the `x-cron-secret` header).
4. File uploads with `STORAGE_DRIVER=local` will not persist on Vercel (ephemeral filesystem). Set `STORAGE_DRIVER=s3` and configure S3 credentials for persistent file storage.

---

## Rollback Notes

### Application rollback

```bash
# Deploy the previous image tag
docker compose down
docker compose up -d --image <previous-tag>
docker compose exec app npx prisma migrate deploy   # no-op if no new migrations
```

Or with git:
```bash
git checkout <previous-commit>
npm ci && npm run build
npm run start
```

### Database rollback

Prisma does not generate automatic down migrations. To roll back a schema change:

1. Restore from a pre-migration database backup (see backup commands below).
2. Or write a manual SQL script that reverses the migration and apply it with `psql` directly.

Always take a backup immediately before running `prisma migrate deploy` in production:

```bash
pg_dump -U postgres apartment_erp | gzip > pg_backup_premigration_$(date +%F).sql.gz
```

### Backup and restore

```bash
# Backup
docker compose exec -T postgres pg_dump -U postgres apartment_erp | gzip > pg_backup_$(date +%F).sql.gz

# Restore
gunzip -c pg_backup_YYYY-MM-DD.sql.gz | docker compose exec -T postgres psql -U postgres apartment_erp

# Or via the built-in restore script (requires DATABASE_URL in env)
node dist/restore-db.js /path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz
```

---

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | DB connectivity + env check; returns `{ status: "ok" }` |
| `GET /api/health/deep` | Extended check including outbox and storage |
| `GET /api/metrics` | Memory, uptime, DB pool stats |

---

## Background Jobs

Enable with `CRON_ENABLED=true`. Jobs fire in-process on the Next.js server:

| Job | Schedule | Action |
|-----|----------|--------|
| Billing generation | Day 1 of month, 03:00 | Creates invoices for all active rooms |
| Overdue check | Daily 04:00 | Marks overdue invoices |
| Reminder sender | Daily 08:00 | Sends LINE payment reminders |

Jobs can also be triggered manually (ADMIN role or `x-cron-secret` header):
```bash
curl -X POST https://your-domain.com/api/system/backup/run \
  -H "x-cron-secret: $CRON_SECRET"
```
