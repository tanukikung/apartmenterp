# ONLYOFFICE Operations Guide

## Architecture

```
Browser
  │  loads editor JS from  https://docs.your-domain.com
  │  WebSocket for co-editing
  ▼
Cloudflare (your domain's DNS + tunnel)
  ├── app.your-domain.com  ──▶  ERP app on Vercel / Render
  └── docs.your-domain.com ──▶  Cloudflare Tunnel ──▶  ONLYOFFICE on your notebook

Your notebook (no public IP needed)
  ├── Docker: onlyoffice container
  └── Docker: cloudflared container  ←── keeps the tunnel open

ONLYOFFICE (on notebook, via tunnel)
  │  fetches template file from  https://app.your-domain.com/api/files/…
  │  POSTs callback to           https://app.your-domain.com/api/templates/…/callback
  ▼
ERP app (Vercel / Render)
  │  verifies JWT, downloads edited file, saves to storage, updates DB
  └── returns { "error": 0 }
```

**What runs where:**

| Component | Where | You manage |
|---|---|---|
| ERP app (Next.js) | Vercel / Render | Environment variables only |
| Database | Vercel / Render (or managed DB) | Nothing |
| ONLYOFFICE | Your notebook | Docker Compose |
| Cloudflare Tunnel | Your notebook (+ Cloudflare dashboard) | One token |

---

## One-time setup (~15 minutes)

### Step 1 — Prerequisites

- Docker Desktop installed on your notebook ([docker.com/get-docker](https://www.docker.com/get-docker))
- A domain on Cloudflare (the free plan is enough)
- The ERP app deployed on Vercel or Render

### Step 2 — Create a Cloudflare Tunnel

1. Go to [one.dash.cloudflare.com](https://one.dash.cloudflare.com) → **Zero Trust** → **Networks** → **Tunnels**
2. Click **Add a tunnel** → choose **Cloudflared** → name it (e.g. `onlyoffice-notebook`)
3. On the **Install and run a connector** screen, copy the **tunnel token** (the long string starting with `eyJ…`)
4. Click **Next**, then configure a **Public Hostname**:
   - **Subdomain:** `docs`
   - **Domain:** `your-domain.com`
   - **Service:** `http://onlyoffice:80`
   *(The service name `onlyoffice` matches the Docker Compose service name — both containers share a network.)*
5. Click **Save tunnel**

### Step 3 — Configure your notebook

```bash
# Clone the repo (or just copy the docker/ folder to your notebook)
cd /path/to/apartment_erp

# Copy the example env file
cp docker/.env.notebook.example docker/.env.notebook
```

Edit `docker/.env.notebook` and paste in:

```
ONLYOFFICE_JWT_SECRET=<the secret you will also set in Vercel/Render>
CLOUDFLARE_TUNNEL_TOKEN=<the token you copied in Step 2>
```

Generate the JWT secret with:
```bash
openssl rand -hex 32
```

### Step 4 — Start ONLYOFFICE

```bash
docker compose -f docker/docker-compose.notebook.yml --env-file docker/.env.notebook up -d
```

ONLYOFFICE image is ~4 GB — the first pull takes a few minutes.

### Step 5 — Set ERP app environment variables

In Vercel → Settings → Environment Variables (or Render → Environment):

| Variable | Value |
|---|---|
| `ONLYOFFICE_DOCUMENT_SERVER_URL` | `https://docs.your-domain.com` |
| `ONLYOFFICE_JWT_SECRET` | same secret you put in `.env.notebook` |
| `APP_BASE_URL` | `https://app.your-domain.com` (your ERP public URL) |

Redeploy the ERP app after setting these.

### Step 6 — Verify everything works

```bash
# 1. ONLYOFFICE is reachable (should return XML)
curl -s https://docs.your-domain.com/hosting/discovery | head -c 200

# 2. Tunnel is connected
docker compose -f docker/docker-compose.notebook.yml --env-file docker/.env.notebook \
  logs cloudflared --tail 20

# 3. ERP health check
curl -s https://app.your-domain.com/api/health
```

Then open `https://app.your-domain.com/admin/templates`, open any template → Edit, and
the ONLYOFFICE editor should load inside the page.

---

## How the callback flow works

1. Admin opens `/admin/templates/[id]/edit`.
2. Page fetches `GET /api/templates/[id]/editor-config?versionId=…` from the ERP app.
3. ERP app returns a signed ONLYOFFICE config containing:
   - `documentServerUrl` — `https://docs.your-domain.com`
   - `document.url` — `https://app.your-domain.com/api/files/onlyoffice/templates/{id}.html`
   - `callbackUrl` — `https://app.your-domain.com/api/templates/{id}/callback?versionId=…`
   - `token` — HS256 JWT signed with `ONLYOFFICE_JWT_SECRET`
4. Browser loads `https://docs.your-domain.com/web-apps/apps/api/documents/api.js` (from notebook).
5. ONLYOFFICE fetches the template file from the ERP app's `/api/files/…` URL.
6. Admin edits and saves.
7. ONLYOFFICE POSTs to the callback URL on the ERP app:
   ```json
   { "status": 2, "url": "https://docs.your-domain.com/…/download", "token": "<jwt>" }
   ```
8. ERP app callback handler:
   - Verifies JWT signature with `ONLYOFFICE_JWT_SECRET`
   - Downloads the edited file from ONLYOFFICE
   - Saves it to the storage layer (local disk or S3)
   - Updates the `DocumentTemplateVersion` in the database
   - Returns `{ "error": 0 }`

**Callback status codes the ERP app acts on:**
- `2` — editing session ended, ready to save
- `6` — force-save (autosave or explicit Ctrl+S)
- All other codes are acknowledged but not saved

---

## URLs that must be publicly reachable

| URL | Needed by | Why |
|---|---|---|
| `https://docs.your-domain.com` | Browser | Load editor JS, WebSocket for co-editing |
| `https://docs.your-domain.com` | ERP app (server-side) | HTML→PDF/DOCX conversion |
| `https://app.your-domain.com/api/files/…` | ONLYOFFICE (notebook) | Fetch template file on open |
| `https://app.your-domain.com/api/…/callback` | ONLYOFFICE (notebook) | POST edited file on save |

Your notebook does **not** need a public IP.
Cloudflare Tunnel creates an outbound-only connection from your notebook to Cloudflare.

---

## Daily notebook operations

### Check everything is running

```bash
docker compose -f docker/docker-compose.notebook.yml --env-file docker/.env.notebook ps
```

Both `onlyoffice` and `cloudflared` should show `Up`.

### Restart after notebook reboot

```bash
docker compose -f docker/docker-compose.notebook.yml --env-file docker/.env.notebook up -d
```

Both containers have `restart: unless-stopped`, so they restart automatically after Docker
restarts (which happens automatically when the OS boots, if Docker Desktop autostart is enabled).

### View logs

```bash
# Tunnel status
docker compose … logs cloudflared --tail 30

# ONLYOFFICE errors
docker compose … logs onlyoffice --tail 30
```

### Stop ONLYOFFICE (e.g. before a long trip)

```bash
docker compose -f docker/docker-compose.notebook.yml --env-file docker/.env.notebook down
```

### Confirm docs.your-domain.com is reachable

```bash
curl -s https://docs.your-domain.com/hosting/discovery | head -c 100
```
Should return XML. If it hangs or returns an error, the tunnel is down — run `up -d` again.

---

## Notebook-specific concerns

| Concern | What to do |
|---|---|
| **Notebook sleep** | Disable sleep/suspend while the editor is in active use. On macOS: System Settings → Battery → Prevent automatic sleeping. On Windows: Power & Sleep → Sleep = Never. |
| **Notebook offline** | ONLYOFFICE becomes unreachable. Users see "ONLYOFFICE unavailable". The ERP app continues working — only the live editor is unavailable. Saved templates are unaffected. |
| **Docker Desktop not autostarting** | Enable "Start Docker Desktop when you sign in" in Docker Desktop settings. |
| **Disk space** | ONLYOFFICE image is ~4 GB. Ensure at least 6 GB free. Named volumes add ~500 MB over time. |
| **Updating ONLYOFFICE** | `docker compose … pull onlyoffice && docker compose … up -d onlyoffice` |
| **JWT secret rotation** | Change `ONLYOFFICE_JWT_SECRET` in both `.env.notebook` and Vercel/Render, restart both `onlyoffice` and the ERP deploy. |

---

## Troubleshooting

### Editor shows "ONLYOFFICE is unavailable" or fails to load

1. Check tunnel is connected: `docker compose … logs cloudflared --tail 20`
2. Test from outside: `curl -s https://docs.your-domain.com/hosting/discovery`
3. Make sure the notebook is not asleep.

### Editor loads but nothing saves (no callback received)

1. Confirm `APP_BASE_URL` is set to your ERP public URL (not localhost).
2. From your notebook, test that the ERP is reachable:
   ```bash
   curl -s https://app.your-domain.com/api/health
   ```
3. Check ONLYOFFICE logs for outbound request errors:
   ```bash
   docker compose … logs onlyoffice --tail 50
   ```

### Callback returns `{ "error": 1 }` (JWT rejected)

- `ONLYOFFICE_JWT_SECRET` in `.env.notebook` and in Vercel/Render must be **exactly identical**.
- Restart after any secret change:
  ```bash
  docker compose … restart onlyoffice
  # and redeploy the ERP app on Vercel/Render
  ```

### Cloudflare Tunnel shows "disconnected" in dashboard

```bash
docker compose -f docker/docker-compose.notebook.yml --env-file docker/.env.notebook \
  restart cloudflared
```
If it keeps disconnecting, verify `CLOUDFLARE_TUNNEL_TOKEN` is correct (no extra spaces).

---

## Fallback option — public IP + Caddy (no Cloudflare)

If you later move ONLYOFFICE to a VPS with a public IP, skip Cloudflare Tunnel and use Caddy:

```bash
# Install Caddy on the VPS
apt install caddy

# /etc/caddy/Caddyfile
docs.your-domain.com {
    reverse_proxy localhost:8080
}
```

Run ONLYOFFICE with `ports: ["127.0.0.1:8080:80"]` and `restart: unless-stopped`.
Caddy handles HTTPS automatically. No Cloudflare tunnel needed.
Update `ONLYOFFICE_DOCUMENT_SERVER_URL` to `https://docs.your-domain.com`.

The ERP app, callback handlers, and JWT logic remain identical in both setups.
