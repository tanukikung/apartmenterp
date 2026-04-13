# Production Checklist

Use this as the final go-live gate for Apartment ERP.

Reference documents:
- `DEPLOY.md` for deployment steps
- `ENV_REQUIRED.md` for environment variables
- `SMOKE_TEST_CHECKLIST.md` for post-deploy UI testing

---

## 1. Release Readiness

- [ ] Code review completed by someone other than the author
- [ ] `npx next build --no-lint` passes in the release environment
- [ ] Database migrations are reviewed and ready to run
- [ ] Rollback owner is assigned
- [ ] Backup taken immediately before deploy

Local verification completed on `2026-04-13`:
- `npx next build --no-lint` passed locally
- Local browser smoke passed for:
  - `/admin/dashboard`
  - `/admin/rooms`
  - `/admin/rooms/798%2F1`
  - `/admin/tenants`
  - `/admin/invoices`
  - `/admin/payments`
  - `/admin/overdue`
  - `/admin/expenses`
  - `/admin/broadcast`
  - `/admin/reports?tab=occupancy`
  - `/admin/settings/integrations`
  - `/admin/documents`
  - `/admin/system-health`

---

## 2. Required Environment

These must be set correctly in production:

- [ ] `DATABASE_URL`
- [ ] `NEXTAUTH_SECRET`
- [ ] `APP_BASE_URL`
- [ ] `NODE_ENV=production`

Required depending on enabled features:

- [ ] `CRON_SECRET` if cron endpoints are exposed
- [ ] `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, and `LINE_ACCESS_TOKEN` or `LINE_CHANNEL_ACCESS_TOKEN` if LINE messaging is used
- [ ] `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BACKUP_S3_BUCKET` if backup to S3 is required
- [ ] `STORAGE_DRIVER=s3` plus storage credentials if uploads must survive container replacement / multi-host deploys
- [ ] `ONLYOFFICE_*` only if that feature is intentionally enabled
- [ ] `ALLOWED_ORIGINS` if production CORS needs to be restricted explicitly

Recommended:

- [ ] `REDIS_URL` for multi-instance or higher-reliability deployments

Notes:
- Single-instance deployment can run without Redis. The app falls back safely.
- Multi-instance deployment should use Redis.
- Production should not ship with placeholder values from `.env.production`.
- Validate that `.env.production` or injected runtime env points to the intended production database. A mismatched `DATABASE_URL` will make `/login` fail with a DB auth error even if local dev still works.

---

## 3. Pre-Deploy Checks

- [ ] Target database is reachable from the app host
- [ ] TLS / reverse proxy / domain are ready
- [ ] Disk space is sufficient for build, uploads, logs, and backups
- [ ] Docker daemon or Node runtime is healthy on the target host
- [ ] Monitoring / error tracking destination is configured if required

Run before cutover:

```bash
npm ci
npx prisma generate
npx next build --no-lint
```

If using Prisma migrations:

```bash
npx prisma migrate deploy
```

Take backup immediately before migrations:

```bash
pg_dump -U postgres apartment_erp | gzip > pg_backup_premigration_$(date +%F).sql.gz
```

---

## 4. Deploy Steps

- [ ] Pull the intended release commit
- [ ] Install dependencies
- [ ] Build the app
- [ ] If using `output: standalone`, start with `node .next/standalone/server.js` instead of `next start`
- [ ] If using `output: standalone`, copy `.next/static` into `.next/standalone/.next/static`
- [ ] If using `output: standalone`, copy `public/` into `.next/standalone/public`
- [ ] Run `npx prisma migrate deploy`
- [ ] Restart app services
- [ ] Confirm the app serves traffic from the intended release

---

## 5. Post-Deploy Health Gate

- [ ] `GET /api/health` returns `status: ok`
- [ ] Authenticated `GET /api/health/deep` returns `success: true`
- [ ] Database shows `connected`
- [ ] App shows `ok`
- [ ] Worker heartbeat is alive
- [ ] Backup status is acceptable for the deployment plan
- [ ] Redis status matches the deployment design:
  - `ok` for multi-instance
  - `not_configured` is acceptable for single-instance

Production must not be considered fully ready if backup is intended but still `not_configured`.

---

## 6. Critical Path Smoke Test

Run the smoke test after deploy using `SMOKE_TEST_CHECKLIST.md`.

Minimum pass list for this release:

- [ ] Login works
- [ ] Dashboard loads without console/runtime errors
- [ ] Room detail works for room numbers containing `/`
- [ ] Expenses page loads without crash
- [ ] Broadcast page loads and shows overdue data
- [ ] Occupancy report loads and floor breakdown is not collapsed to floor `0`
- [ ] Payments page loads without hydration mismatch errors
- [ ] System health page renders without API failure

---

## 7. Production Sign-Off

- [ ] Engineering sign-off
- [ ] Operations / deployer sign-off
- [ ] Smoke test sign-off
- [ ] Rollback path confirmed

| Item | Owner | Status | Notes |
|------|-------|--------|-------|
| Environment verified |  |  |  |
| Backup completed |  |  |  |
| Migration completed |  |  |  |
| Health checks passed |  |  |  |
| Smoke test passed |  |  |  |
| Release approved |  |  |  |

---

## 8. Rollback Trigger

Rollback immediately if any of the following happen after deploy:

- Login fails for valid admin users
- Billing / invoices / payments pages return runtime errors
- Health endpoint fails or database becomes unavailable
- Migration causes data corruption or missing critical records
- LINE / reminder flows fail in a way that blocks operations

Rollback reference:
- `DEPLOY.md` -> rollback notes
