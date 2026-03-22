# Restore Guide — Apartment ERP

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Restore Steps](#restore-steps)
3. [Using the Restore Script](#using-the-restore-script)
4. [Manual Restore Commands](#manual-restore-commands)
5. [Post-Restore Validation](#post-restore-validation)
6. [Destructive Warnings](#destructive-warnings)

---

## Prerequisites

### Required Tools

| Tool | Purpose |
|------|---------|
| `psql` (PostgreSQL client) | Execute SQL restore |
| `gzip` | Decompress `.sql.gz` backup |
| `pg_dump` (optional) | Take a backup BEFORE restoring |

### Required Access

- Write access to the target PostgreSQL database
- `DATABASE_URL` environment variable set
- Backup file accessible on local filesystem

---

## Restore Steps

### Step 0 — Take a Fresh Backup FIRST

**⚠️ DESTRUCTIVE OPERATION — Always backup before restoring.**

```bash
cd /opt/apartment-erp/apps/erp

# Take a snapshot backup before overwriting
npx tsx scripts/backup-db.ts

# Verify it completed:
ls -la data/backups/ | tail -3
```

### Step 1 — Confirm Backup File Exists and Is Valid

```bash
# List available backups:
ls -lh /opt/apartment-erp/apps/erp/data/backups/

# Verify integrity:
gunzip -t /opt/apartment-erp/apps/erp/data/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz
echo $?  # Must print 0
```

### Step 2 — Identify Target Database

```bash
# Confirm DATABASE_URL points to the correct database:
echo $DATABASE_URL
# Should be: postgresql://postgres:<password>@<host>:5432/apartment_erp
```

### Step 3 — Stop Application (Recommended)

```bash
# Stop app to prevent writes during restore:
docker compose stop app
# Or for non-Docker:
pm2 stop apartment-erp
```

### Step 4 — Run Restore

See [Using the Restore Script](#using-the-restore-script) or [Manual Restore Commands](#manual-restore-commands).

### Step 5 — Restart Application

```bash
# Docker:
docker compose start app

# Non-Docker:
pm2 restart apartment-erp
```

### Step 6 — Validate

See [Post-Restore Validation](#post-restore-validation).

---

## Using the Restore Script

This repo provides `apps/erp/scripts/restore-db.ts`.

### Usage

```bash
cd /opt/apartment-erp/apps/erp

# Requires:
#   DATABASE_URL environment variable
#   First argument: path to .sql.gz backup file

npx tsx scripts/restore-db.ts /path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz
```

### Expected Output (on success)

```
type: 'restore_start', filePath: '/path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz'
type: 'restore_success', durationMs: 45230
```

### Expected Output (on failure)

```
type: 'restore_failed', message: 'psql exited with code 1'
```

Common causes:
- Backup file does not exist → check path argument
- `DATABASE_URL` not set → export it first
- Database not reachable → check host/port/firewall

---

## Manual Restore Commands

If the script is unavailable, use these commands directly.

### Full Database Restore

```bash
# Decompress and pipe to psql (silent mode):
gunzip -c /path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz | psql $DATABASE_URL

# Or with verbose output (shows each statement):
gunzip -d -c /path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz | psql -v ON_ERROR_STOP=1 $DATABASE_URL
```

### Restore to a Different Database (Clone)

```bash
# 1. Create new database:
psql $MASTER_DATABASE_URL -c "CREATE DATABASE apartment_erp_clone;"

# 2. Restore to clone:
gunzip -c /path/to/backup.sql.gz | psql "postgresql://postgres:<password>@<host>:5432/apartment_erp_clone"
```

### Restore Specific Tables Only

```bash
# Extract a specific table dump (requires custom pg_dump with --table flag):
gunzip -c /path/to/backup.sql.gz \
  | psql $DATABASE_URL \
  | grep -E "^(ALTER|CREATE|COPY)" \
  | psql $DATABASE_URL
```

> **Note:** Table-level restore from a full dump is error-prone. Only use for non-critical data recovery.

---

## Post-Restore Validation

### 1. Verify Database is Reachable

```bash
curl --fail --silent https://your-domain.com/api/health
# Expected: 200
```

### 2. Verify Row Counts

```bash
# Login to psql:
psql $DATABASE_URL

# Check key tables have data:
SELECT COUNT(*) FROM rooms;           -- should be > 0
SELECT COUNT(*) FROM tenants;         -- should be > 0
SELECT COUNT(*) FROM invoices;        -- should be >= 0
SELECT COUNT(*) FROM payments;         -- should be >= 0
SELECT COUNT(*) FROM billing_periods;  -- should be > 0
SELECT COUNT(*) FROM room_billings;    -- should be >= 0

# Check no orphaned records:
SELECT COUNT(*) FROM invoices WHERE "roomBillingId" NOT IN (SELECT id FROM room_billings);
-- should be 0
```

### 3. Verify Application Loads

```
1. Open https://your-domain.com/admin/dashboard
2. Login as admin
3. Navigate to /admin/rooms — rooms should appear
4. Navigate to /admin/tenants — tenants should appear
5. Navigate to /admin/billing — billing periods should appear
```

### 4. Check Logs for Errors

```bash
# Docker:
docker compose logs app --tail=50 | grep -i error

# Systemd:
journalctl -u apartment-erp --since "10 minutes ago" | grep -i error
```

---

## Destructive Warnings

### ⚠️ THIS OPERATION OVERWRITES ALL DATA

A database restore replaces **all current data** with the data from the backup file.

**Before restoring:**
- ✅ Take a fresh backup of the current state
- ✅ Verify the backup file is not corrupted
- ✅ Confirm `DATABASE_URL` points to the correct (non-production) database when testing

**When restoring to production:**
- ✅ Schedule a maintenance window (app is down during restore)
- ✅ Stop the application to prevent concurrent writes
- ✅ Have a second operator on standby to confirm app restart

**After restoring:**
- ✅ Clear any application-level caches (Redis, if used)
- ✅ Verify session cookies are invalidated (force re-login)
- ✅ Notify users if session state was affected

### Common Restore Mistakes

| Mistake | Consequence |
|---------|-------------|
| Restoring to wrong database | Data in wrong environment overwritten |
| Not stopping app before restore | Corrupt state — app and DB out of sync |
| Restoring from stale backup | Recent transactions lost |
| Running `DROP DATABASE` before restore | Cannot restore without recreation rights |
| Forgetting to restart app after restore | App uses stale in-memory state |

---

## Related Documents

- [BACKUP_PROCEDURE.md](./BACKUP_PROCEDURE.md)
- [ROLLBACK_PROCEDURE.md](./ROLLBACK_PROCEDURE.md)
- [DEPLOY_RUNBOOK.md](./DEPLOY_RUNBOOK.md)
