# Deploy Runbook — Apartment ERP

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Deploy Paths](#deploy-paths)
4. [First Deploy](#first-deploy)
5. [Normal Deploy](#normal-deploy)
6. [Post-Deploy Checks](#post-deploy-checks)
7. [Failure Points](#failure-points)

---

## Prerequisites

### Required Tools
| Tool | Minimum Version | Purpose |
|------|----------------|---------|
| Node.js | 20+ | Local dev, build, scripts |
| npm | 10+ | Dependency management |
| PostgreSQL client (`psql`) | 15+ | DB restore operations |
| `pg_dump` | 15+ | DB backup |
| `gzip` | any | Backup compression |
| Docker + Docker Compose | 24+ / 2.20+ | Container deploy |

### Required Accounts / Secrets
| Secret | Used By | How to Obtain |
|--------|---------|---------------|
| `DATABASE_URL` | App runtime | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | App runtime | `openssl rand -hex 32` |
| `LINE_CHANNEL_ID` | LINE integration | LINE Developers Console |
| `LINE_CHANNEL_SECRET` | LINE webhook | LINE Developers Console |
| `LINE_ACCESS_TOKEN` | LINE messaging | LINE Developers Console |
| `VPS_HOST` | GitHub Actions deploy | Your VPS public IP |
| `VPS_USER` | GitHub Actions deploy | SSH username on VPS |
| `VPS_SSH_KEY` | GitHub Actions deploy | Private SSH key (added to GitHub Secrets) |
| `APP_URL` | Deploy health check | Public URL of deployed app |

---

## Environment Variables

### Required for All Deploys

```env
# Database
DATABASE_URL="postgresql://postgres:<password>@<host>:5432/apartment_erp"

# Auth
NEXTAUTH_SECRET="<generate with: openssl rand -hex 32>"
NEXTAUTH_URL="https://your-domain.com"       # public URL in production
APP_BASE_URL="https://your-domain.com"

# Application
NODE_ENV="production"
CRON_SECRET="<generate with: openssl rand -hex 32>"
```

### Optional

```env
# LINE Messaging API (for tenant notifications)
LINE_CHANNEL_ID="your_line_channel_id"
LINE_CHANNEL_SECRET="your_line_channel_secret"
LINE_ACCESS_TOKEN="your_line_access_token"
LINE_USER_ID="your_line_bot_user_id"

# Redis (optional — leave unset if not used)
# REDIS_URL="redis://redis:6379"

# OnlyOFFICE (optional — leave unset if not used)
# ONLYOFFICE_DOCUMENT_SERVER_URL="http://localhost:8080"
# ONLYOFFICE_JWT_SECRET="<generate with: openssl rand -hex 32>"
# ONLYOFFICE_CALLBACK_BASE_URL="https://your-domain.com"
```

> **Never commit `.env` to git.** Use `.env.example` as a template.

---

## Deploy Paths

| Path | When to Use | Auto-Runs On Push? |
|------|-------------|-------------------|
| **GitHub Actions → VPS** | Production on main branch | ✅ Yes |
| **Docker Compose** | Self-hosted VPS/NAS | ❌ Manual |
| **Docker (single container)** | Manual production | ❌ Manual |
| **Local dev** | Development | ❌ Manual |

---

## First Deploy

### Step 1 — Provision Infrastructure

```bash
# On your VPS
ssh <user>@<host>
sudo apt update && sudo apt install -y docker.io docker-compose
```

### Step 2 — Clone Repository

```bash
git clone https://github.com/<org>/apartment-erp.git /opt/apartment-erp
cd /opt/apartment-erp
```

### Step 3 — Create `.env`

```bash
cp apps/erp/.env.example apps/erp/.env
# Edit apps/erp/.env with real values (DATABASE_URL, NEXTAUTH_SECRET, etc.)
```

### Step 4 — Start Database with Docker Compose

```bash
cd /opt/apartment-erp/docker
docker compose up -d db
# Wait for DB to be healthy
docker compose ps
```

### Step 5 — Run Prisma Migrations

```bash
cd /opt/apartment-erp/apps/erp
npx prisma migrate deploy
# Verify:
npx prisma db pull --print  # should not error
```

### Step 6 — (Optional) Seed Initial Data

```bash
# Only on first deploy when DB is empty
# The app's /sign-up page creates the first admin when DB is empty
# Or use the admin setup wizard at /admin/setup

# If you need a CLI seed, add seed data via the UI or:
psql <DATABASE_URL> -c "INSERT INTO ..."
```

### Step 7 — Build and Start App

```bash
# Option A — Docker Compose (all-in-one)
cd /opt/apartment-erp/docker
docker compose up -d app

# Option B — Manual Node
cd /opt/apartment-erp/apps/erp
npm ci
npm run build
node .next/standalone/server.js
```

### Step 8 — Verify

```bash
curl https://your-domain.com/api/health
# Expected: {"status":"ok","database":"connected",...}
```

---

## Normal Deploy (GitHub Actions)

Every push to `main` triggers the pipeline automatically.

### Pipeline Steps (`.github/workflows/deploy.yml`)

```
1. Checkout
2. Docker Buildx setup
3. GHCR login
4. Docker metadata (image tags)
5. Build & push Docker image to GHCR
6. SSH to VPS
   - docker compose pull app
   - docker compose up -d --no-deps app
   - docker compose exec -T app npx prisma migrate deploy
   - docker system prune -f
7. Wait 30s
8. Health check: GET /api/health → must return 200
```

### Manual Trigger

```bash
# Via GitHub web UI: Actions → Deploy to Production → Run workflow
# Or via GitHub CLI:
gh workflow run deploy.yml --ref main
```

### GitHub Secrets Required (repo-level)

Set these in `GitHub → Settings → Secrets → Actions`:

- `VPS_HOST` — VPS IP address
- `VPS_USER` — SSH username
- `VPS_SSH_KEY` — private key with VPS SSH access
- `APP_URL` — public app URL for health check

### Migrations in Pipeline

The deploy step **automatically runs `prisma migrate deploy`** on every deploy. This is safe because:
- Migrations are idempotent (`up`/`down` guards in Prisma)
- No data loss — migrations only alter schema, not data
- If migration fails, the old container keeps running

---

## Normal Deploy (Docker Compose — Manual)

```bash
cd /opt/apartment-erp/docker

# Pull latest code
git pull

# Pull latest Docker image (if using image-based deploy)
docker compose pull app

# Restart app (migrations run automatically via deploy hook)
docker compose up -d --no-deps app

# Or full restart (includes db):
docker compose up -d
```

---

## Post-Deploy Checks

Run these within 5 minutes of a deploy completing.

### 1. Health Endpoint

```bash
curl --fail --silent https://your-domain.com/api/health
# Must return 200
```

### 2. Login Flow

```bash
# 1. Open https://your-domain.com/login
# 2. Authenticate with admin credentials
# 3. Verify redirect to /admin/dashboard
# 4. Check browser console for errors
```

### 3. Core Feature Smoke Test

- [ ] Billing list page loads (`/admin/billing`)
- [ ] Room list page loads (`/admin/rooms`)
- [ ] Tenant list page loads (`/admin/tenants`)
- [ ] Can open any invoice detail page

### 4. Background Jobs

```bash
# Check logs for any errors:
docker compose logs app --tail=50
docker compose logs worker --tail=50   # if worker container exists
```

---

## Failure Points

### Deploy Fails at Migration

**Symptom:** Deploy pipeline step "Running pending migrations..." returns non-zero exit.

**Action:**
```bash
# On VPS, check what migration is failing:
docker compose exec -T app npx prisma migrate status

# If needed, reset migration record (safe on production if schema is in sync):
docker compose exec -T app npx prisma migrate resolve --applied <migration-name>

# Or manually run the pending migration:
docker compose exec -T app npx prisma migrate deploy
```

### Deploy Fails at Health Check

**Symptom:** Pipeline logs show `curl --fail ... exit 1` after the 30s wait.

**Action:**
```bash
# On VPS:
docker compose logs app --tail=100
docker compose exec -T app curl --fail http://localhost:3000/api/health

# Common cause: environment variable not set in docker compose
# Check .env is present and DATABASE_URL is correct
```

### App Starts but Returns 500 on API Calls

**Symptom:** Health check passes but `/api/rooms` or other endpoints return 500.

**Action:**
```bash
# Check DB connection:
docker compose exec -T app node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.\$queryRaw\`SELECT 1\`.then(() => { console.log('DB OK'); process.exit(0); }).catch(e => { console.error('DB FAIL', e.message); process.exit(1); });
"
```

### LINE Notifications Not Working

**Symptom:** LINE bot does not respond after deploy.

**Action:** Verify `LINE_ACCESS_TOKEN`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` are set in `.env` and that the LINE webhook URL (`/api/line/webhook`) is reachable from the internet.

---

## Related Documents

- [BACKUP_PROCEDURE.md](./BACKUP_PROCEDURE.md)
- [RESTORE_GUIDE.md](./RESTORE_GUIDE.md)
- [ROLLBACK_PROCEDURE.md](./ROLLBACK_PROCEDURE.md)
- [QA_CHECKLIST.md](./QA_CHECKLIST.md)
