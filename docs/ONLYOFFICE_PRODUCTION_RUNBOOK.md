# ONLYOFFICE Production Runbook — Apartment ERP

> Quick reference for deploying and operating ONLYOFFICE Document Server alongside the Apartment ERP in production.

---

## At a Glance

| Question | Answer |
|----------|--------|
| **ONLYOFFICE role** | Visual HTML template editor only. ERP remains source of truth. |
| **Impact if down** | Admin UI shows "editor disabled" — template upload via HTML file still works |
| **Start-up time** | ~60–120 seconds on first boot (fonts download) |
| **RAM requirement** | 2 GB minimum, 4 GB recommended |
| **Graceful degradation** | Yes — app works without it; HTML upload is always available |

---

## 1. Environment Variables

Add these to your `.env.production` (or set in Docker Compose):

```bash
# ── Enable / Disable ──────────────────────────────────────────────────
# Set to 'false' to completely disable the ONLYOFFICE editor.
ONLYOFFICE_ENABLED="true"

# ── Document Server URL ───────────────────────────────────────────────
# The URL the BROWSER uses to load ONLYOFFICE JS.
# On a VPS with a domain + reverse proxy:
ONLYOFFICE_DOCUMENT_SERVER_URL="https://docs.your-domain.com"
#
# On localhost for dev:
ONLYOFFICE_DOCUMENT_SERVER_URL="http://localhost:8080"

# ── JWT Secret ────────────────────────────────────────────────────────
# MUST match JWT_SECRET in the ONLYOFFICE container.
# Generate: openssl rand -hex 32
ONLYOFFICE_JWT_SECRET="<your-32-byte-hex-secret>"

# ── Callback URL ──────────────────────────────────────────────────────
# The URL ONLYOFFICE uses to call back into the ERP (webhook).
# Docker Compose on VPS: use the internal service name
ONLYOFFICE_CALLBACK_BASE_URL="http://erp-app:3000"
#
# With reverse proxy on same VPS:
ONLYOFFICE_CALLBACK_BASE_URL="https://your-app-domain.com"
```

### Minimal Production Setup (with reverse proxy on same VPS)

```bash
# In .env.production:
ONLYOFFICE_ENABLED="true"
ONLYOFFICE_DOCUMENT_SERVER_URL="https://docs.your-domain.com"
ONLYOFFICE_JWT_SECRET="$(openssl rand -hex 32)"
ONLYOFFICE_CALLBACK_BASE_URL="https://your-app-domain.com"
ONLYOFFICE_PORT="8080"
```

---

## 2. Docker Compose — Production

ONLYOFFICE is included in `docker-compose.prod.yml`. To start everything:

```bash
cd /opt/apartment-erp/apps/erp

# Create .env.production with the vars above
cp .env.example .env.production
# Edit .env.production with your real values

# Start all services (includes onlyoffice):
docker compose -f docker-compose.prod.yml up -d

# Check ONLYOFFICE is up:
docker compose -f docker-compose.prod.yml logs onlyoffice --tail 20
```

To start WITHOUT ONLYOFFICE (saves ~4 GB RAM):

```bash
# In .env.production:
ONLYOFFICE_ENABLED="false"

# Then start without the onlyoffice service:
docker compose -f docker-compose.prod.yml up -d postgres redis migrate erp-app worker backup-scheduler
```

---

## 3. Reverse Proxy Configuration (Caddy)

If running ONLYOFFICE on the same VPS as the app, use Caddy to expose it on a public URL:

```caddy
# /etc/caddy/Caddyfile

docs.your-domain.com {
    reverse_proxy localhost:8080
}

app.your-domain.com {
    reverse_proxy localhost:3000
}
```

`ONLYOFFICE_CALLBACK_BASE_URL` would then be `https://your-app-domain.com`.

---

## 4. Verifying the Setup

### Step 1 — Health Check

```bash
# Check app health (includes onlyoffice status):
curl -s https://your-app-domain.com/api/health | jq '.data.services.onlyoffice'
# Expected: "ready" when onlyoffice is up

# Dedicated onlyoffice health:
curl -s https://your-app-domain.com/api/health/onlyoffice | jq '.data'
# Expected: { "enabled": true, "configured": true, "usable": true, "connected": true }
```

### Step 2 — Admin UI Check

1. Log in to the ERP admin panel
2. Go to **Templates** → select any template → **Edit**
3. The ONLYOFFICE editor should load inside the page
4. Look for the green **"Connected"** status badge at the top of the editor

### Step 3 — Test Save Flow

1. Make a small edit in ONLYOFFICE (e.g., change some text)
2. Wait for autosave (or press Ctrl+S)
3. Refresh the page — the edit should persist
4. Check **Versions** panel — a new draft version should appear

---

## 5. Common Failures

### "Cannot connect to ONLYOFFICE" in admin UI

**Cause**: ONLYOFFICE container is not running or unreachable.

```bash
# Check if container is running:
docker compose -f docker-compose.prod.yml ps onlyoffice

# Check logs:
docker compose -f docker-compose.prod.yml logs onlyoffice --tail 50

# Restart onlyoffice:
docker compose -f docker-compose.prod.yml restart onlyoffice
```

### "JWT verification failed" in admin UI

**Cause**: `ONLYOFFICE_JWT_SECRET` in `.env.production` does not match `JWT_SECRET` in the ONLYOFFICE container.

```bash
# Fix: set both to the same value, then restart:
docker compose -f docker-compose.prod.yml restart onlyoffice erp-app
```

### ONLYOFFICE starts but editor never loads

**Cause**: `ONLYOFFICE_CALLBACK_BASE_URL` points to wrong address (e.g., `localhost` instead of the Docker service name).

```bash
# In Docker Compose, ONLYOFFICE must call back using the service name:
# .env.production should have:
ONLYOFFICE_CALLBACK_BASE_URL="http://erp-app:3000"
# NOT:
# ONLYOFFICE_CALLBACK_BASE_URL="http://localhost:3000"
```

### First boot takes a long time (2+ minutes)

**Normal**: First start downloads fonts (~4 GB) and initializes internal services. Wait up to 2 minutes. The `docker compose ps` will show "starting" until ready.

---

## 6. Fallback — Using HTML Upload Without ONLYOFFICE

The ERP always works without ONLYOFFICE:

1. Create your HTML template file locally (include `{{placeholders}}`)
2. Go to **Templates** → select template → **Edit**
3. In the **Versions** panel, click **Upload**
4. Select your `.html` file
5. Click **Activate** to use it

Preview is always available and renders the template with live ERP data, regardless of ONLYOFFICE status.

---

## 7. Quick Operations

```bash
# Restart ONLYOFFICE (after config change):
docker compose -f docker-compose.prod.yml restart onlyoffice

# Check ONLYOFFICE health:
curl -s http://localhost:8080/healthcheck

# Stop ONLYOFFICE (saves RAM):
docker compose -f docker-compose.prod.yml stop onlyoffice

# Disable ONLYOFFICE completely:
# Edit .env.production: ONLYOFFICE_ENABLED="false"
# Then: docker compose -f docker-compose.prod.yml up -d erp-app

# View ONLYOFFICE logs:
docker compose -f docker-compose.prod.yml logs onlyoffice --tail 30 -f
```

---

## 8. Reference

| File | Purpose |
|------|---------|
| `apps/erp/docker-compose.prod.yml` | Production compose with onlyoffice service |
| `apps/erp/.env.example` | All ONLYOFFICE env vars documented |
| `src/lib/onlyoffice/index.ts` | `isOnlyOfficeEnabled()`, `isOnlyOfficeConfigured()` |
| `src/components/onlyoffice/OnlyOfficeFrame.tsx` | Embedded editor React component |
| `src/app/api/health/onlyoffice/route.ts` | Health check endpoint |
| `src/app/api/templates/[id]/callback/route.ts` | ONLYOFFICE save callback handler |
| `docs/onlyoffice-ops.md` | Cloudflare tunnel setup for laptop-hosted ONLYOFFICE |
| `docs/ONLYOFFICE_INTEGRATION_DESIGN.md` | Full architecture and design document |
