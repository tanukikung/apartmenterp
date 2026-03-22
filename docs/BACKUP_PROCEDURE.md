# Backup Procedure — Apartment ERP

## Table of Contents
1. [What Must Be Backed Up](#what-must-be-backed-up)
2. [Backup Strategy](#backup-strategy)
3. [Running a Manual Backup](#running-a-manual-backup)
4. [Automated Scheduled Backups](#automated-scheduled-backups)
5. [Verifying Backup Success](#verifying-backup-success)
6. [Restore Reference](#restore-reference)

---

## What Must Be Backed Up

### Database (Primary — Required)

The PostgreSQL database is the single source of truth for all application data:

- **All tables**: rooms, tenants, room_tenants, contracts, room_billings, billing_periods, invoices, payments, conversations, messages, outbox_events, audit_logs, document_templates, message_templates, settings, etc.
- **Stored as**: Plain SQL dump (`.sql.gz`) — human-readable, portable
- **Encryption at rest**: Depends on your PostgreSQL/host configuration

### Application Files (Secondary — If Custom)

These are typically rebuilt from git, but include:

| Path | What It Contains | Backed Up? |
|------|-----------------|-----------|
| `apps/erp/.env` | Secrets, connection strings | ✅ Yes — store in a secrets manager |
| `docker/docker-compose.yml` | Service configuration | ⚠️ Only if customized |
| `prisma/migrations/` | Schema migrations | ✅ No — rebuilt from repo |
| User-uploaded files | Invoice PDFs, etc. | ⚠️ Only if local storage driver used |

### What NOT to Back Up

- `node_modules/` — rebuilt with `npm ci`
- `.next/` build output — rebuilt with `npm run build`
- Docker named volumes (backed up separately via the DB dump)

---

## Backup Strategy

### Retention Policy

| Environment | Frequency | Retention | Storage Location |
|-------------|-----------|-----------|-----------------|
| Production | Daily (3:00 AM) | 30 days | Separate backup volume or cloud storage |
| Staging | Weekly | 7 days | Local backup disk |
| Development | Manual | None | Not required |

Set via `BACKUP_RETENTION_DAYS` environment variable (default: `7`).

### Backup Tooling

This repo provides:

| File | Purpose |
|------|---------|
| `apps/erp/scripts/backup-db.ts` | Main backup script using `pg_dump` + `gzip` |
| `apps/erp/scripts/backup-scheduler.ts` | Cron-based scheduled backup runner |
| `apps/erp/src/lib/ops/backup.ts` | Backup operations library |

---

## Running a Manual Backup

### Prerequisites

```bash
# Required tools (must be on PATH):
which pg_dump    # PostgreSQL client
which gzip       # Compression

# Required env:
#   DATABASE_URL   — PostgreSQL connection string
```

### Step 1 — Set Environment

```bash
cd /opt/apartment-erp/apps/erp

# Option A — Source from .env
set -a && source .env && set +a

# Option B — Export directly
export DATABASE_URL="postgresql://postgres:<password>@localhost:5432/apartment_erp"
```

### Step 2 — Run Backup Script

```bash
# Via tsx (development tool):
npx tsx scripts/backup-db.ts

# Output file path is printed in logs:
#   type: 'backup_start', filePath: '/path/to/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz'
```

### Step 3 — Verify File Created

```bash
# Check backup directory (default: ./data/backups):
ls -la /opt/apartment-erp/apps/erp/data/backups/

# File should exist with .sql.gz extension:
# pg_backup_20260321_020000Z.sql.gz
```

### Expected Output (on success)

```
type: 'backup_start', filePath: '/path/to/pg_backup_20260321_020000Z.sql.gz'
type: 'backup_success', durationMs: 3450, retentionDays: 7, deletedOldFiles: 0
```

### Expected Output (on failure)

```
type: 'backup_failed', message: 'pg_dump exited with code 1'
```

Common failure causes:
- `DATABASE_URL` not set → "Backup cannot run because DATABASE_URL is not configured"
- `pg_dump` not on PATH → "required tools are missing from PATH: pg_dump"
- DB connection refused → check `DATABASE_URL` host/port

---

## Automated Scheduled Backups

### Setup — Cron Scheduler (In-Process)

```bash
# Set backup schedule via environment variable (default: daily at 2 AM):
export BACKUP_CRON="0 3 * * *"

# Run the scheduler (keeps process alive):
npx tsx scripts/backup-scheduler.ts
# Runs in background; logs to stdout/logger
```

### Setup — System Cron (Recommended for Production)

```bash
# Add to system crontab:
crontab -e

# Add this line (daily at 3 AM):
0 3 * * * cd /opt/apartment-erp/apps/erp && DATABASE_URL="postgresql://..." /usr/bin/npx tsx scripts/backup-db.ts >> /var/log/apartment-erp-backup.log 2>&1
```

### Setup — Docker Healthcheck + Sidecar

```yaml
# In docker-compose.override.yml:
backup:
  image: apartment-erp:latest
  depends_on:
    db:
      condition: service_healthy
  environment:
    DATABASE_URL: postgresql://postgres:password@db:5432/apartment_erp
    BACKUP_CRON: "0 2 * * *"
    BACKUP_RETENTION_DAYS: "30"
  entrypoint: ["npx", "tsx", "scripts/backup-scheduler.ts"]
  restart: unless-stopped
```

### Backup Directory

By default, backups are stored at:
```
<project-root>/apps/erp/data/backups/
```

Configure via `BACKUP_DIR` environment variable if needed.

---

## Verifying Backup Success

### Step 1 — Check Log Output

```bash
# Look for 'backup_success' in application logs:
grep "backup_success" /var/log/apartment-erp-backup.log

# Or via Docker:
docker compose logs app | grep backup_success
```

### Step 2 — Verify File Integrity

```bash
# Check file is non-empty:
ls -lh /opt/apartment-erp/apps/erp/data/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz

# Verify gzip is valid:
gunzip -t /opt/apartment-erp/apps/erp/data/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz
# Exit code 0 = valid gzip archive

# Verify SQL header is present:
gunzip -c /opt/apartment-erp/apps/erp/data/backups/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz | head -3
# Should show PostgreSQL dump header like:
# -- PostgreSQL database dump
```

### Step 3 — Test Restore (Never Skip This)

See [RESTORE_GUIDE.md](./RESTORE_GUIDE.md) for full restore procedure.

Quick check on a separate test database:

```bash
# Create test DB
psql <DATABASE_URL> -c "CREATE DATABASE apartment_erp_test"

# Restore to test DB
gunzip -c /path/to/backup.sql.gz | psql apartment_erp_test

# Verify row counts are non-zero:
psql <TEST_DATABASE_URL> -c "SELECT COUNT(*) FROM rooms;"
psql <TEST_DATABASE_URL> -c "SELECT COUNT(*) FROM invoices;"
```

---

## Restore Reference

If you need to restore from a backup, see [RESTORE_GUIDE.md](./RESTORE_GUIDE.md).

Quick restore command:

```bash
# Restore to existing database (WARNING: destructive):
gunzip -c /path/to/pg_backup_YYYYMMDD_HHMMSSZ.sql.gz | psql $DATABASE_URL
```

> ⚠️ **This overwrites all data.** Only use for disaster recovery or explicit restore scenarios.

---

## Related Documents

- [RESTORE_GUIDE.md](./RESTORE_GUIDE.md)
- [ROLLBACK_PROCEDURE.md](./ROLLBACK_PROCEDURE.md)
- [DEPLOY_RUNBOOK.md](./DEPLOY_RUNBOOK.md)
