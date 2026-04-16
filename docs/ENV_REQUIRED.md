# Environment Variables Reference

All variables are consumed by the app at `apps/erp`. Set them in `.env` (development) or `.env.production` / platform dashboard (production).

---

## Mandatory — App will not function without these

| Variable | Format | Example | Breaks without it |
|----------|--------|---------|-------------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/dbname` | Nothing works; DB client fails at startup |
| `NEXTAUTH_SECRET` | Min 32-char random string | `openssl rand -hex 32` | All login/session creation fails; users cannot authenticate |
| `APP_BASE_URL` | HTTPS URL, no trailing slash | `https://erp.example.com` | PDF links broken; LINE webhook callback URL wrong; CSRF origin check may fail |

---

## Authentication — Required for production, optional in dev

| Variable | Format | Notes | Breaks without it |
|----------|--------|-------|-------------------|
| `AUTH_SECRET` | String | Alias for `NEXTAUTH_SECRET`; either works | Falls back to `NEXTAUTH_SECRET` |
| `NEXTAUTH_URL` | Full URL | `https://erp.example.com` | Not strictly required at runtime; used by some NextAuth internals |
| `COOKIE_SECURE` | `"true"` or `"false"` | Set `true` in production (HTTPS only) | Defaults `false`; session cookies sent over HTTP if not set |
| `ADMIN_SIGNUP_CODE` | String | If set, new admin sign-ups require this code | Without it, first user can register freely; subsequent users are gated by staff request flow |

---

## LINE Messaging — Required for outbound notifications

All three must be set together. Without any one of them, LINE is disabled app-wide.

| Variable | Format | Where to get | Breaks without it |
|----------|--------|-------------|-------------------|
| `LINE_CHANNEL_ID` | Numeric string | LINE Developers console → Basic settings | LINE webhook verification fails; all send calls no-op |
| `LINE_CHANNEL_SECRET` | String | LINE Developers console → Basic settings | Webhook signature verification throws; incoming messages rejected |
| `LINE_ACCESS_TOKEN` | String | LINE Developers console → Messaging API → Channel access token | Outbound messages fail; invoice/reminder LINE sends silently skipped |
| `LINE_CHANNEL_ACCESS_TOKEN` | String | Same as `LINE_ACCESS_TOKEN` | Alias; app reads either; provide at least one |
| `LINE_USER_ID` | String (`Uxxxxxxx`) | LINE Developers console or webhook logs | Admin-push notifications disabled; tenant chat unaffected |

**Fallback behaviour:** when LINE credentials are absent, invoice sends and reminders still create outbox events and audit log entries. Messages are not delivered to LINE but no errors surface to the user.

---

## File Storage

| Variable | Values / Format | Default | Notes |
|----------|----------------|---------|-------|
| `STORAGE_DRIVER` | `local` \| `s3` | `local` | `local` writes to `UPLOAD_DIR`; `s3` requires all S3 vars below |
| `UPLOAD_DIR` | Absolute path | `$TMPDIR/apartment-erp-uploads` | Only used when `STORAGE_DRIVER=local`; ephemeral on Vercel/containers without a volume mount |
| `FILE_MAX_UPLOAD_MB` | Integer | `10` | Maximum file size per upload request |
| `FILE_ALLOWED_MIME` | Comma-separated MIME types | Built-in list | Override permitted upload types |

### S3 variables (only required when `STORAGE_DRIVER=s3`)

| Variable | Required | Notes |
|----------|----------|-------|
| `S3_BUCKET` | Yes | Bucket name; app throws at startup if missing when driver is s3 |
| `S3_REGION` | Yes | e.g. `ap-southeast-1` |
| `S3_ENDPOINT` | No | Override for S3-compatible services (MinIO, Supabase Storage, Cloudflare R2) |
| `S3_FORCE_PATH_STYLE` | No | `"true"` for MinIO / path-style endpoints |
| `AWS_ACCESS_KEY_ID` | Yes (unless using IAM role) | Standard AWS credential |
| `AWS_SECRET_ACCESS_KEY` | Yes (unless using IAM role) | Standard AWS credential |

---

## Background Jobs and Cron

| Variable | Default | Notes |
|----------|---------|-------|
| `CRON_ENABLED` | `true` | Set `false` to disable in-process scheduled jobs (e.g. when running multiple instances) |
| `CRON_SECRET` | — | Required to call cron-trigger endpoints from external schedulers; without it, endpoints return 401 for unauthenticated calls |
| `OUTBOX_ENABLED` | `true` | Set `false` to disable the outbox processor entirely; messages will queue but never dispatch |

---

## Backup

| Variable | Default | Notes |
|----------|---------|-------|
| `BACKUP_DIR` | `$TMPDIR/apartment-erp-backups` | Directory for backup files |
| `BACKUP_CRON` | `0 3 * * *` | Cron schedule for automatic backups (3 AM daily) |
| `BACKUP_RETENTION_DAYS` | `7` | Number of days to keep backup files |

---

## Rate Limiting

| Variable | Default | Notes |
|----------|---------|-------|
| `RATE_LIMIT_WINDOW_MS` | `60000` (1 minute) | Window duration in milliseconds |
| `RATE_LIMIT_MAX` | `120` | Maximum requests per window per IP |

---

## Logging

| Variable | Default | Values | Notes |
|----------|---------|--------|-------|
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` | Controls log verbosity |
| `LOG_DIR` | — | Absolute path | If set, structured JSON logs are written to files here; otherwise stdout only |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` | Affects error detail in API responses; set `production` in prod |

---

## Admin / Internal

| Variable | Notes |
|----------|-------|
| `ADMIN_TOKEN` | Static token alternative for API auth; not recommended for production; superseded by session-based auth |

---

## Minimum production `.env` file

```env
# Mandatory
DATABASE_URL=postgresql://postgres:STRONG_PASS@localhost:5432/apartment_erp
NEXTAUTH_SECRET=<openssl rand -hex 32>
APP_BASE_URL=https://erp.example.com

# Auth
COOKIE_SECURE=true
NODE_ENV=production

# Jobs
CRON_ENABLED=true
CRON_SECRET=<openssl rand -hex 32>

# File storage (choose one)
STORAGE_DRIVER=local
UPLOAD_DIR=/var/apartment-erp/uploads

# LINE (omit if not using LINE integration)
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_ACCESS_TOKEN=
```
