# Free Deploy Guide — Railway & Render

This guide is for developers who want to deploy the Apartment ERP to production without managing servers, Docker, or DevOps. It covers **zero-cost managed platforms** that handle PostgreSQL, Node.js hosting, and TLS certificates automatically.

For Docker/VPS deploys, see [DEPLOY.md](./DEPLOY.md).

---

## Why This Guide Exists

The existing [DEPLOY.md](./DEPLOY.md) covers Docker and VPS scenarios — great for teams with DevOps experience, but heavy for individual developers or small teams who just want a working deployed app.

This guide targets **Platform-as-a-Service (PaaS)** providers that abstract away all infrastructure:

| What you get | Docker/VPS | Railway / Render |
|---|---|---|
| PostgreSQL database | Self-managed | Managed, free tier included |
| TLS / HTTPS | Manual (Nginx/Coolify) | Automatic |
| Environment variables | Manual `.env` file | Dashboard UI |
| Migrations | `docker compose exec app ...` | Automatic via `postinstall` |
| Server costs | VPS monthly fee | Free tier available |
| Scaling | Manual | Automatic |

---

## 1. Recommended: Railway

[Railway](https://railway.app) is the best free-tier option for this stack because it provides a **persistent PostgreSQL 15+ database** on the free plan (500 hours/month, 1GB RAM, spins down after 30 min inactivity).

### Step 1: Connect Your GitHub Repo

1. Go to [railway.app](https://railway.app) and sign up with GitHub.
2. Click **New Project** → **Deploy from GitHub repo**.
3. Select your `apartment-erp` repository.
4. Railway will auto-detect a Node.js project and run `npm install` then `npm run build`.

> **Note:** Railway does NOT use the Dockerfile by default. It uses Nixpacks (Node.js buildpack). The project's `postinstall` script (defined in `package.json`) runs `prisma migrate deploy` automatically after `npm install` — so your database schema is migrated on every deploy without manual steps.

### Step 2: Add Environment Variables

In the Railway dashboard, go to your project → **Variables**. Add each variable below.

#### Required Variables

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | (Railway provides this) | Go to **Railway Dashboard → your database → Connection String** and copy it. Format: `postgresql://user:pass@host:port/db` |
| `NEXTAUTH_SECRET` | Generate: `openssl rand -hex 32` | Session signing secret. Never share this. |
| `NEXTAUTH_URL` | `https://your-app-name.up.rail.app` | Railway provides a `.rail.app` domain. You can also add a custom domain. **No trailing slash.** |
| `APP_BASE_URL` | Same as `NEXTAUTH_URL` | Used for server-side fetch calls. |

#### Optional — LINE Integration (required for tenant chat/notifications)

> LINE features are disabled entirely if these are not set. All other ERP features work normally.

| Variable | Value | Notes |
|---|---|---|
| `LINE_CHANNEL_ID` | From [ LINE Developers Console ](https://developers.line.biz/) | Found in your LINE Channel settings |
| `LINE_CHANNEL_SECRET` | From LINE Developers Console | Used for webhook signature verification |
| `LINE_ACCESS_TOKEN` | From LINE Developers Console | Long-lived access token (or use `LINE_CHANNEL_ACCESS_TOKEN`) |

#### Optional — Sentry Error Tracking

| Variable | Value | Notes |
|---|---|---|
| `SENTRY_DSN` | From [sentry.io](https://sentry.io) | Enables error tracking and alerts |

#### Optional — S3 Database Backups

S3 backup upload is entirely optional. If `BACKUP_S3_BUCKET` (and/or the AWS credentials) are not set, the system still creates compressed local backups via `pg_dump + gzip` and retains them for `BACKUP_RETENTION_DAYS`. Only the S3 upload step is skipped.

| Variable | Required for S3? | Default | Description |
|---|---|---|---|
| `BACKUP_S3_BUCKET` | Yes | _(none)_ | S3 bucket name, e.g. `my-erp-backups`. Controls whether S3 upload is attempted. |
| `AWS_ACCESS_KEY_ID` | Yes | _(none)_ | IAM user access key. |
| `AWS_SECRET_ACCESS_KEY` | Yes | _(none)_ | IAM user secret key. |
| `AWS_REGION` | No | `ap-southeast-1` | AWS region where the bucket lives. |
| `BACKUP_CRON` | No | `0 3 * * *` (3am daily) | Cron schedule for automatic backups. Crontab format: `minute hour day-of-month month day-of-week`. |
| `BACKUP_RETENTION_DAYS` | No | `7` | Days to keep both local and S3 backups before deleting old files. |

**IAM permissions needed** on the IAM user credentials:
```
s3:PutObject   — upload each new backup file
s3:ListBucket   — list existing backups for retention cleanup
s3:DeleteObject — remove backups older than BACKUP_RETENTION_DAYS
```

**Bucket policy example:**
```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:ListBucket", "s3:DeleteObject"],
    "Resource": ["arn:aws:s3:::my-erp-backups", "arn:aws:s3:::my-erp-backups/backups/*"]
  }]
}
```

---

### Step 3: Deploy

1. Click **Deploy** in the Railway dashboard.
2. Railway clones your repo, runs `npm install`, then `npm run build`.
3. The `postinstall` script in `package.json` runs `prisma migrate deploy` automatically.
4. When the deploy finishes, Railway shows a URL like `https://apartment-erp.up.rail.app`.

> **First deploy tip:** If the build fails on migration (e.g., DATABASE_URL not set yet), go to **Variables**, confirm `DATABASE_URL` is present and correct, then trigger a redeploy from the **Deployments** tab.

---

### Step 4: Verify the Deploy

Visit your app's health endpoint:

```
https://your-railway-url.up.rail.app/api/health
```

Expected response:

```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-04-11T..."
}
```

If you see `"database": "degraded"` or an error, check the **Logs** tab in Railway for details. Common causes:
- `DATABASE_URL` is wrong or not set — paste the raw connection string from Railway dashboard
- PostgreSQL is still starting — wait 30 seconds and refresh

---

## 2. Alternative: Render

[Render](https://render.com) also offers a free PostgreSQL + Node.js hosting tier. It works similarly to Railway but with a different deployment model.

### Option A — Docker (recommended on Render)

Render natively supports Dockerfile deploys. This is the cleanest path since the project already has a production Dockerfile:

1. Create a **New Web Service** on Render.
2. Connect your GitHub repo.
3. Set **Build Command**: leave blank (Render auto-detects Dockerfile).
4. Set **Start Command**: leave blank (Dockerfile `ENTRYPOINT` handles it).
5. Add environment variables in the Render dashboard (same list as Railway above).
6. Add a **Persistent Disk** if you need file uploads (or rely on S3).

> The Dockerfile's `entrypoint.sh` runs `prisma migrate deploy` on every container start. Migrations are idempotent so this is safe on restarts.

### Option B — Node.js Buildpack (no Dockerfile)

If you prefer not to use Docker on Render:

1. Create a **New Web Service** → **Node.js** buildpack.
2. Set **Build Command**: `npm run build`
3. Set **Start Command**: `node server.js`
4. **Critical:** Render's Node.js buildpack does NOT run `postinstall` automatically. You must add a custom init script or modify the build command:

   **Build Command:**
   ```bash
   npm install && npx prisma migrate deploy && npm run build
   ```

   Or create a file `render-build.sh` in your repo root:
   ```bash
   #!/bin/sh
   npx prisma migrate deploy
   npm run build
   ```

   And set the Build Command to: `sh render-build.sh`

5. Add all environment variables in the Render dashboard.
6. Add a **PostgreSQL** database via Render's dashboard (free tier).

> **`postinstall` caveat on Render:** Render's buildpack runs `npm install --production` by default, which skips devDependencies. The `prisma` CLI and `tsx` are in devDependencies — they're needed for migrations and seeding. Using the custom build command above (with full `npm install`) works around this.

---

## 3. What to Do After Your First Deploy

### Seed the Admin Account

If this is a fresh database, the system has no users yet. Seed the database with default admin accounts:

**Option A — Setup Wizard (easiest):**
1. Visit `https://your-domain.com/admin/setup`
2. Follow the interactive wizard
3. Creates: admin user (`owner`) + staff user (`staff`) with default passwords

**Option B — CLI:**
```bash
# From your local machine with your production DATABASE_URL
DATABASE_URL="postgresql://..." npx tsx prisma/seed.ts
```

Default credentials (change immediately after first login):
- Admin: `owner` / `Owner@12345`
- Staff: `staff` / `Staff@12345`

### Configure LINE Webhook URL

> Requires HTTPS. Your Railway/Render `.rail.app` or `.onrender.com` URL already has TLS.

1. Go to [LINE Developers Console](https://developers.line.biz/) → your channel.
2. Under **Messaging API** → **Webhook URL**, enter:
   ```
   https://your-domain.com/api/line/webhook
   ```
3. Enable **Use webhook** toggle.
4. Verify the webhook with the **Verify** button.

### Configure LINE Bot Profile (name, icon, greeting)

The bot name, icon, and greeting message are set **directly in the LINE Developer Console** — not in the app code or environment variables. These are the first things tenants see when they add or chat with your LINE bot, so they matter for trust.

**In LINE Developers Console → your Messaging API channel:**

| Setting | Where to find it | Why it matters |
|---|---|---|
| **Bot name** | Basic settings tab | Shown as the sender name in every chat. Use your building/apartment name. |
| **Icon / Picture** | Basic settings tab | Shown in chat threads and the bot profile card. Use a clear logo (500x500px recommended). |
| **Greeting message** | Messaging API tab → Greeting section | Sent automatically when a tenant first adds your bot. Keep it short, e.g. "ยินดีต้อนรับสู่ [ Apartment Name ] พิมพ์ \"ยอดค้าง\" เพื่อดูยอดค่าใช้จ่าย" |
| **Auto-reply** (optional) | Messaging API tab | Replies when the bot can't match a message. Useful to direct tenants to your support contact. |

**Steps:**
1. **Basic settings** tab → edit **Bot name** and upload an **Icon** image.
2. **Messaging API** tab → **Greeting message** → toggle **Enable** and enter your greeting.
3. Optionally configure a **Welcome rich menu** for quick-access buttons (the app provides `POST /api/line/rich-menu` to set this programmatically after deployment).

> **Note:** Bot name/icon changes can take up to 15 minutes to propagate to all LINE users. Greeting messages update faster (usually within minutes).

### Set Up S3 Backups (Disaster Recovery)

1. Create an S3 bucket (e.g., `my-erp-backups`) in AWS.
2. Create an IAM user with these permissions:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": ["s3:PutObject", "s3:ListBucket", "s3:DeleteObject"],
       "Resource": ["arn:aws:s3:::my-erp-backups", "arn:aws:s3:::my-erp-backups/backups/*"]
     }]
   }
   ```
3. Add credentials to Railway/Render environment variables.
4. Trigger a manual backup from **Admin → System → Backup**.

---

## 4. Known Limitations on Free Tiers

### Railway Free Tier

| Limit | Value |
|---|---|
| Monthly hours | 500 hours (resets monthly) |
| Cold starts | Spins down after 30 min inactivity, ~30s wake-up |
| RAM | 1 GB |
| Persistent storage | None — files go to S3 |
| Custom domain | Free (add DNS record) |
| SSL/TLS | Free, automatic |
| PostgreSQL | 500 MB free storage |

**Tip:** Enable a free uptime monitor (e.g., [UptimeRobot](https://uptimerobot.com)) to ping your app every 25 minutes — this prevents cold starts during business hours and keeps the 500-hour allocation active.

### Render Free Tier

| Limit | Value |
|---|---|
| Sleep after inactivity | 15 min inactivity → sleep |
| Spinning up | ~30s–2 min after sleep |
| Disk | 512 MB (ephemeral) |
| PostgreSQL | 1 GB, sleeps after 90 days |

### General Free Tier Limitations

| Feature | Impact | Mitigations |
|---|---|---|
| No persistent disk | File uploads not stored locally | Use S3 (`BACKUP_S3_BUCKET`) |
| No true cron jobs | Background billing/overdue jobs don't fire on schedule | Use an external uptime monitor to trigger job endpoints manually, or rely on manual triggers in the admin UI |
| Cold start latency | First request after idle is slow | Use uptime monitoring to keep alive |
| No Redis | Outbox/in-memory job state resets on restart | Acceptable for small scale — jobs re-trigger normally |

> **Good news:** The Apartment ERP is designed to work without Redis. The system degrades gracefully — no background job persistence means jobs may re-fire on restart, but the admin UI can trigger them manually and the system is safe to re-run.

---

## 5. Environment Variables Checklist

| Variable | Required? | Description | Where to Get |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | Railway/Render PostgreSQL dashboard |
| `NEXTAUTH_SECRET` | **Yes** | Session signing secret (min 32 chars) | `openssl rand -hex 32` |
| `NEXTAUTH_URL` | **Yes** | App base URL with protocol, no trailing slash | Your Railway/Render app URL |
| `APP_BASE_URL` | **Yes** | Same as NEXTAUTH_URL | Same as above |
| `LINE_CHANNEL_ID` | No | LINE OA channel ID | LINE Developers Console |
| `LINE_CHANNEL_SECRET` | No | LINE OA channel secret | LINE Developers Console |
| `LINE_ACCESS_TOKEN` | No | LINE long-lived access token | LINE Developers Console (Messaging API tab) |
| `CRON_SECRET` | No | Protects cron job webhook endpoints | `openssl rand -hex 32` |
| `REDIS_URL` | No | Redis connection (app works without it) | Leave blank on Railway/Render free tier |
| `SENTRY_DSN` | No | Sentry error tracking | [sentry.io](https://sentry.io) → project settings |
| `BACKUP_S3_BUCKET` | No | S3 bucket for DB backups | AWS S3 console |
| `AWS_ACCESS_KEY_ID` | No | IAM access key for S3 backups | AWS IAM |
| `AWS_SECRET_ACCESS_KEY` | No | IAM secret key for S3 backups | AWS IAM |
| `AWS_REGION` | No | S3 bucket region | e.g. `ap-southeast-1` |
| `BACKUP_CRON` | No | Cron schedule for auto-backups | Default: `0 3 * * *` (3am daily) |
| `BACKUP_RETENTION_DAYS` | No | Days to keep backups | Default: `7` |

---

## 6. Troubleshooting

### Migration Fails on Deploy

**Symptom:** Build log shows `Error: P1001: Can't reach database server` or migration errors.

**Fix:**
1. Confirm `DATABASE_URL` is set in Railway/Render variables — check for typos.
2. On Railway: go to your PostgreSQL database → **Connect** → copy the exact connection string.
3. Redeploy after confirming `DATABASE_URL` is correct.

---

### Health Check Returns `degraded`

**Symptom:** `GET /api/health` returns `{"status":"ok","database":"degraded",...}`

**Cause:** Likely a timing issue — the database connection pool is not fully established, or one auxiliary check (outbox/Redis) failed.

**Fix:**
1. Check **Logs** in Railway/Render for specific error messages.
2. A degraded health status on first deploy usually self-heals after the first successful DB query. Try refreshing the health endpoint.
3. If persistent: verify `DATABASE_URL` format is correct (some connection strings include `?sslmode=require` which must be preserved).

---

### LINE Webhook Not Working

**Symptom:** LINE webhook verify fails, or LINE doesn't respond to tenant messages.

**Checks:**
1. Is your app URL HTTPS? LINE requires HTTPS. The free `.rail.app` and `.onrender.com` domains provide HTTPS.
2. Is the webhook URL correct? It must be exactly `https://your-domain.com/api/line/webhook` — no trailing slash, no `http`.
3. Have you enabled **Use webhook** in LINE Developers Console?
4. Check Railway/Render logs for incoming webhook requests — does the request arrive?
5. If using LINE SDK features, confirm `LINE_CHANNEL_SECRET` and `LINE_ACCESS_TOKEN` are correct in the dashboard.

---

### Build Fails: `prisma: command not found`

**Cause:** On Render with Node.js buildpack, `npm install --production` strips devDependencies where `prisma` and `tsx` live.

**Fix:** Use the custom Build Command (Option B, step 4 above) that runs `npm install` (without `--production`) before `prisma migrate deploy`.

---

### Build Fails: `Cannot find module './prisma'`

**Cause:** The `prisma/` directory is not copied into the standalone build output.

**Fix:** Ensure `prisma/` is present in your repo root. The Dockerfile handles this with `COPY --from=builder /app/prisma ./prisma`. On Railway/Render with Node.js buildpack, the entire repo is cloned so `prisma/` is available.

---

## Quick Reference

### Default Admin Credentials (change immediately after first login)

| Role | Username | Password |
|---|---|---|
| Admin | `owner` | `Owner@12345` |
| Staff | `staff` | `Staff@12345` |

### Key URLs

| Purpose | Path |
|---|---|
| Admin dashboard | `/admin` |
| Setup wizard | `/admin/setup` |
| Health check | `/api/health` |
| Deep health check | `/api/health/deep` |
| LINE webhook | `/api/line/webhook` |
| System jobs | `/admin/system-jobs` |
| Database backup | `/admin/system` |

### Seed / Migration Commands (for reference)

```bash
# Run migrations (idempotent — safe to re-run)
npx prisma migrate deploy

# Seed database (creates building, floors, rooms, admin users)
npx tsx prisma/seed.ts

# Generate Prisma client (after schema changes)
npx prisma generate
```

---

## Which Platform Should You Choose?

| Criteria | Railway | Render |
|---|---|---|
| Free PostgreSQL | Yes (500MB) | Yes (1GB) |
| Git-connected deploy | Yes | Yes |
| Dockerfile support | Yes | Yes |
| Node.js buildpack | Yes | Yes |
| Cold start prevention | Uptime monitor needed | Uptime monitor needed |
| Custom domain | Free | Free |
| Ease of setup | Very easy | Moderate (Docker) / Easy (buildpack) |
| **`postinstall` support** | Automatic | Requires workaround |

**Recommendation:** Start with **Railway**. It has the simplest workflow, generous free tier, and works out-of-the-box with the project's `postinstall` script.
