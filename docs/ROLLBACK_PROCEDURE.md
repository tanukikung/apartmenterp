# Rollback Procedure — Apartment ERP

## Table of Contents
1. [When to Roll Back](#when-to-roll-back)
2. [Rollback Types](#rollback-types)
3. [App Rollback (No DB Change)](#app-rollback-no-db-change)
4. [Database Rollback](#database-rollback)
5. [Safe Rollback Sequence](#safe-rollback-sequence)
6. [Post-Rollback Verification](#post-rollback-verification)
7. [Known Risks](#known-risks)

---

## When to Roll Back

Roll back when:

| Situation | Roll Back App? | Roll Back DB? |
|----------|---------------|---------------|
| Deploy completed but health check failed | ✅ Yes | ❌ No |
| Deploy succeeded but `/api/health` returns 500 | ✅ Yes | ❌ No |
| New billing/invoice data is wrong after deploy | ⚠️ Assess | ⚠️ Assess |
| Migrated schema broke a feature | ✅ Yes | ❌ No (re-migrate forward) |
| Accidentally deleted data | ❌ No | ✅ Yes (restore from backup) |
| Security vulnerability introduced in build | ✅ Yes | ❌ No |

---

## Rollback Types

### Type 1 — App Rollback (Most Common)

**What changes:** Docker image tag / container version. No schema change.

**When to use:** Deploy succeeded but app is misbehaving (500 errors, wrong behavior).

**DB impact:** None. The old container connects to the same database.

**Recovery time:** 2–5 minutes.

---

### Type 2 — Database Rollback (Emergency Only)

**What changes:** PostgreSQL data restored from a `.sql.gz` backup file.

**When to use:** Accidental data deletion, catastrophic corruption, or migration that cannot be forward-migrated.

**App impact:** App must be stopped during restore.

**Recovery time:** 5–30 minutes depending on DB size.

> ⚠️ **Database rollback loses all transactions since the backup was taken.** Use only when the alternative is worse.

---

## App Rollback (No DB Change)

### GitHub Actions (Automatic — Most Common)

If the deploy workflow fails, it does **not** cancel the old running container. The previous container continues serving traffic.

To manually roll back via GitHub Actions:

```bash
# Option A: Re-run the last successful deploy workflow
gh run list --workflow=deploy.yml --status=success --limit=1
# Copy the run ID, then:
gh run rerun <run-id>

# Option B: Trigger deploy for the last known-good commit
gh workflow run deploy.yml --ref <previous-main-sha>
```

### Docker Compose (Manual)

```bash
cd /opt/apartment-erp/docker

# Check current container image tag:
docker compose ps app
docker inspect $(docker compose ps -q app) | grep Image

# Roll back to previous image tag (if using tags):
docker compose pull app
docker compose up -d --no-deps app

# Or: force previous SHA (from git log):
git log --oneline -5
docker compose build --build-arg IMAGE_SHA=<previous-sha> app
docker compose up -d --no-deps app
```

### If No Previous Image Is Available

```bash
# Re-build from the previous commit:
git checkout <previous-main-sha>
cd apps/erp && npm ci && npm run build
docker compose build app
docker compose up -d --no-deps app
git checkout main  # back to current
```

---

## Database Rollback

### Step 0 — Assess

**⚠️ Destructive. Read [RESTORE_GUIDE.md](./RESTORE_GUIDE.md) before proceeding.**

Only roll back the database when:
- Data integrity is severely compromised
- A forward migration is not feasible
- The data loss window is acceptable to stakeholders

### Step 1 — Take a Snapshot of Current State

```bash
# Take a backup of the current (bad) state BEFORE rolling back:
cd /opt/apartment-erp/apps/erp
npx tsx scripts/backup-db.ts
# File: data/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz
```

### Step 2 — Stop Application

```bash
# Prevent writes during restore:
docker compose stop app
# Or:
pm2 stop apartment-erp
```

### Step 3 — Identify the Target Backup

```bash
# List backups (find one before the problem started):
ls -lt data/backups/

# Common backup naming:
# pg_backup_20260321_020000Z.sql.gz
# pg_backup_20260320_020000Z.sql.gz
```

### Step 4 — Run Restore

```bash
# Using the restore script:
npx tsx scripts/restore-db.ts data/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz

# Verify output:
# type: 'restore_success', durationMs: ...
```

### Step 5 — Restart Application

```bash
docker compose start app
# Or:
pm2 start apartment-erp
```

### Step 6 — Verify

See [Post-Rollback Verification](#post-rollback-verification).

---

## Safe Rollback Sequence

### Scenario: Deploy Succeeded But App Returns 500

```
1. Stop new app container        → docker compose stop app
2. Start old app container       → docker compose up -d --no-deps app
3. Wait 10 seconds
4. Check health: curl /api/health
5. If healthy: done
6. If unhealthy: escalate to DB rollback or full incident
```

### Scenario: Suspect Data Corruption After Migration

```
1. Take backup of current state      → npx tsx scripts/backup-db.ts
2. Stop app                         → docker compose stop app
3. Restore from last good backup     → npx tsx scripts/restore-db.ts <backup.gz>
4. Start app                       → docker compose start app
5. Verify row counts                → psql -c "SELECT COUNT(*) FROM rooms;"
6. Notify users of data window     → "System restored to 06:00 UTC state"
```

### Scenario: Migration Column Lost Data

```
# Do NOT rollback DB. Instead, forward-migrate:
# Identify which rows are missing:
psql $DATABASE_URL -c "SELECT id, roomNo FROM room_billings WHERE waterUnits IS NULL;"

# Re-calculate from source data or re-run billing import
# Then redeploy the corrected migration
```

---

## Post-Rollback Verification

### App Health

```bash
curl --fail --silent https://your-domain.com/api/health
# Expected: 200
```

### Key Data Checks

```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM rooms;"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM invoices WHERE status = 'GENERATED' OR status = 'SENT';"
psql $DATABASE_URL -c "SELECT COUNT(*) FROM room_billings WHERE status = 'LOCKED';"
```

### Functional Checks

```
1. Login at /login as admin
2. Go to /admin/dashboard — should load without errors
3. Go to /admin/billing — cycles should appear
4. Go to /admin/rooms — rooms should appear
5. Check logs: docker compose logs app --tail=20 | grep -i error
```

### If Rolling Back DB

Additionally verify:
- Invoice totals match room billing totals
- Payment records are intact
- Audit log entries are present for recent operations

---

## Known Risks

### App Rollback Risks

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Old container still has the bug | Low | Pin to specific git SHA |
| Session tokens invalidated | Low | Users forced to re-login |
| Connection pool stale | Medium | Restart app container (`docker compose restart app`) |

### Database Rollback Risks

| Risk | Likelihood | Mitigation |
|------|------------|-----------|
| Transactions since backup lost | Certain | Acceptable only for catastrophic errors |
| App schema mismatch after restore | Medium | Always match app version to DB schema |
| Dual-write inconsistency | Medium | Stop app before restore |
| Backup file corrupted | Low | Verify with `gunzip -t` before restore |
| Restore to wrong database | Low | Double-check `DATABASE_URL` before running |

### What NOT to Roll Back

- **Individual billing records** — use the billing import correction workflow instead
- **Payment records** — use the payment reversal workflow instead
- **Sent LINE messages** — cannot be undone; send a correction message instead
- **Invoice PDFs already sent** — mark invoice as cancelled, send revised invoice

---

## Related Documents

- [BACKUP_PROCEDURE.md](./BACKUP_PROCEDURE.md)
- [RESTORE_GUIDE.md](./RESTORE_GUIDE.md)
- [DEPLOY_RUNBOOK.md](./DEPLOY_RUNBOOK.md)
