# Apartment ERP — Backup & Disaster Recovery Documentation

## 1. Backup Strategy

### 1.1 Database Backup (PostgreSQL)

#### Full Backup (Daily)
- **Tool**: `pg_dump` with custom format (`.dump`)
- **Frequency**: Daily at 02:00 local time (configurable via `BACKUP_CRON` env)
- **Compression**: gzip level 9
- **Retention**:
  - 7 daily backups kept locally
  - 30 daily backups kept in S3
- **Command**: `pg_dump --format=custom --compress=9 --no-owner --no-acl`

#### WAL Archiving (Continuous)
- **Frequency**: Continuous via PostgreSQL WAL archiving to S3
- **Point-in-time recovery (PITR)**: Up to 5-minute RPO
- **Config**: PostgreSQL `wal_level = replica`, `archive_mode = on`

#### Verification
```bash
# Verify backup integrity
pg_restore --dbname=test --dry-run /path/to/backup.dump
# Also compute SHA256 checksum
sha256sum /path/to/backup.dump.gz
```

### 1.2 File/Upload Backup
- File uploads (tenant docs, etc.) backed up to S3 with versioning enabled
- Upload bucket: `apt-uploads` (configurable via `BACKUP_S3_BUCKET_UPLOADS`)
- Retention: 30 days ( Glacier Deep Archive after 30 days)

### 1.3 Redis Backup
- Redis RDB snapshots: `save 900 1` (every 15 mins if at least 1 key changed)
- AOF persistence enabled: `appendonly yes`
- Redis backup included in daily DB backup as a separate file

---

## 2. S3 Storage Structure

```
s3://apt-backups-{env}/
├── pg/
│   ├── daily/
│   │   ├── 2026-05-04T020000Z.dump.gz          # Daily backup
│   │   ├── 2026-05-04T020000Z.dump.gz.SHA256    # Checksum
│   │   └── ...
│   └── wal/
│       └── 2026-05-04/                         # WAL segments
├── redis/
│   └── daily/
│       └── 2026-05-04RDB.rdb
└── uploads/
    └── daily/
        └── 2026-05-04/
```

---

## 3. Backup Commands

### Run manual backup
```bash
# Full database backup
./scripts/backup.sh

# With S3 upload
DATABASE_URL="postgresql://postgres:..." \
BACKUP_S3_BUCKET="apt-backups-prod" \
AWS_ACCESS_KEY_ID="..." \
AWS_SECRET_ACCESS_KEY="..." \
node scripts/backup-db.ts
```

### Restore from backup
```bash
# Restore from local file
./scripts/restore.sh /path/to/backup.dump.gz

# Restore from S3
node scripts/restore-db.ts s3://apt-backups-prod/pg/daily/2026-05-04T020000Z.dump.gz
```

---

## 4. Disaster Recovery Procedures

### 4.1 DB Loss (RTO < 15 min, RPO < 5 min)

**Trigger**: Database unreachable or data corruption detected

**Recovery Steps**:
```bash
# 1. Stop the application
kubectl scale deployment apartment-erp --replicas=0

# 2. Restore from latest backup
./scripts/restore.sh s3://apt-backups-prod/pg/daily/$(date +%Y-%m-%dT020000Z).dump.gz

# 3. Apply any pending migrations (Phase 8)
npx prisma migrate deploy

# 4. Verify key data
node scripts/audit-data-integrity.js

# 5. Restart application
kubectl scale deployment apartment-erp --replicas=3
```

**Verification after restore**:
```bash
# Check row counts
psql $DATABASE_URL -c "SELECT count(*) FROM invoices; SELECT count(*) FROM payments;"

# Check Phase 8 tables exist and have data
psql $DATABASE_URL -c "SELECT count(*) FROM financial_audit_logs; SELECT count(*) FROM reconciliation_issues;"

# Verify no duplicate payments (payment storm protection)
psql $DATABASE_URL -c "SELECT matchedInvoiceId, count(*) FROM payments WHERE status='CONFIRMED' GROUP BY matchedInvoiceId HAVING count(*) > 1;"
```

### 4.2 Redis Failure

**Trigger**: Redis connection error or `apt:system:readonly` key missing

**Behavior**:
- Circuit breaker: OPEN state logged, subsequent Redis calls skip execution
- Kill switch: If Redis is down and `isSystemReadOnly()` fails-open, mutations ALLOWED (intentional — Redis is cache, not source of truth)
- LINE: If Redis is down, LINE API circuit breaker remains in last known state; messages queue in outbox

**Recovery Steps**:
```bash
# 1. Restart Redis
docker compose -f deploy/docker-compose.prod.yml restart redis

# 2. Verify Redis is back
redis-cli ping  # Should return PONG

# 3. Check circuit breaker states
curl -s http://localhost:3001/api/admin/system-health | jq '.metrics'

# 4. If LINE circuit is stuck OPEN, manually reset via admin panel
```

### 4.3 LINE API Down

**Trigger**: LINE API returns 503 or times out repeatedly

**Behavior**:
- Circuit breaker: After 5 consecutive failures, circuit opens (OPEN state)
- Invoice send: Returns success but puts delivery in PENDING (retry via outbox)
- Outbox: Messages remain PENDING; processor retries with exponential backoff
- Dead letter: After 5 retries, message moved to FAILED with retry log

**Recovery Steps**:
```bash
# 1. Verify LINE circuit is OPEN
curl -s http://localhost:3001/api/admin/system-health | jq '.circuitBreakers.line'

# 2. Wait for recovery timeout (60s) or manually close circuit
# POST /api/admin/system-health/circuit-breaker/reset (if exists)

# 3. Retry dead letter messages
curl -X POST http://localhost:3001/api/admin/messaging/dlq/retry-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 4. Re-send failed invoices manually from admin panel
```

### 4.4 Full Region Failure (Multi-AZ DR)

**Trigger**: Entire deployment region is down

**RTO/RPO Targets**:
- RTO: < 15 minutes (DNS failover to standby region)
- RPO: < 5 minutes (WAL archiving continues during failure)

**Procedure**:
```bash
# 1. Activate standby database
# Promote read replica to primary in DR region
aws rds promote-read-replica --db-instance-identifier apt-erp-dr

# 2. Update DNS (Route 53) to point to DR region
aws route53 change-resource-record-sets \
  --hosted-zone-id ZXXXXXXXX \
  --change-batch file://dns-failover.json

# 3. Start application in DR region
docker compose -f deploy/docker-compose.prod.yml up -d

# 4. Verify
curl https://apt-erp-dr.example.com/api/health
```

---

## 5. Validation Scripts

### Pre-deployment validation
```bash
# Run integrity check
node scripts/audit-data-integrity.js

# Expected output: no inconsistencies
```

### Post-backup validation
```bash
# Verify backup file is not empty
test $(stat -c%s backup.dump.gz) -gt 1024 && echo "OK: backup not empty"

# Verify checksum matches
sha256sum backup.dump.gz | diff - <(cat backup.dump.gz.SHA256) && echo "OK: checksum match"
```

### Post-restore validation
```bash
# Verify Phase 8 tables
psql $DATABASE_URL -c "SELECT count(*) FROM financial_audit_logs; SELECT count(*) FROM reconciliation_issues;"

# Verify soft-delete works
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const invoice = await prisma.invoice.findFirst({ where: { deletedAt: null } });
  console.log('Invoice soft-delete columns:', invoice ? 'OK' : 'FAIL');
  const payment = await prisma.payment.findFirst({ where: { deletedAt: null } });
  console.log('Payment soft-delete columns:', payment ? 'OK' : 'FAIL');
  await prisma.\$disconnect();
}
check();
"
```

---

## 6. Retention Policy

| Data Type | Local Retention | S3 Retention | Archive After |
|-----------|-----------------|--------------|--------------|
| Daily DB backup | 7 days | 30 days | 90 days → Glacier |
| WAL segments | N/A | 7 days | 7 days |
| Redis RDB snapshot | 7 days | 30 days | 90 days |
| File uploads | N/A | 30 days | 30 days |
| Alert logs | 30 days | 90 days | 90 days |
| Audit logs (FinancialAuditLog) | Forever (DB) | Export to S3 monthly | 1 year → Glacier |

---

## 7. Backup Schedule (cron)

```
# Daily full backup at 02:00 AM
0 2 * * * /app/scripts/backup.sh >> /var/log/backup.log 2>&1

# Hourly check for dead letter messages
30 * * * * curl -s http://localhost:3001/api/admin/messaging/dlq | jq '.count' | grep -v 0 && alert...

# Weekly integrity check
0 3 * * 0 node /app/scripts/audit-data-integrity.js >> /var/log/integrity.log 2>&1
```

---

## 8. RTO / RPO Targets

| Backup Type | Frequency | RPO (max data loss) | RTO (max downtime) | Mechanism |
|-------------|-----------|---------------------|-------------------|-----------|
| Full DB dump | Daily at 2am | 24 hours | 2 hours | pg_dump → encrypted → S3 |
| WAL archiving | Continuous | 1 minute | 30 minutes | PostgreSQL WAL → S3 via wal-g-archive.sh |
| Outbox event snapshot | Hourly (implicit in DB backup) | Covered by DB backup | 0 (events are in DB) | Events survive DB restore |
| Application state | Daily | 24 hours | 1 hour | DB backup covers app config in DB |

**RPO verification**: WAL archiving enables PITR to within 1 minute of any crash.
**RTO verification**: Full stack restart tested quarterly via `scripts/backup-restore/dr-drill.sh`.

## 9. Backup Monitoring (Metrics)

The following Prometheus metrics track backup health:

```typescript
// src/lib/metrics/registry.ts
recordBackupMetrics({
  lastSuccessTimestamp: Date.now() / 1000,  // Unix seconds
  lastBackupSizeBytes: 12_345_678,
  oldestWalAgeSeconds: 45,                   // 0 if WAL not configured
});

recordRestoreTestResult(Date.now() / 1000);  // Unix seconds of last DR drill
```

Alert thresholds:
- `backup_last_success_timestamp < now - 26h` → **CRITICAL** (backup overdue)
- `restore_test_last_success < now - 7d` → **WARNING** (DR drill overdue)
- `backup_oldest_wal_age_seconds > 3600` → **WARNING** (WAL archiving delayed)

## 10. Outbox Crash Recovery

The outbox processor recovers from crashes via visibility timeout:

```typescript
// On startup and every poll cycle:
const stuck = await prisma.$queryRaw`
  SELECT id FROM outbox_events
  WHERE status = 'PROCESSING'
    AND "processingAt" < ${new Date(Date.now() - VISIBILITY_TIMEOUT_MS)}
  FOR UPDATE SKIP LOCKED
`;

// Reset stuck events to PENDING for reprocessing
await prisma.outboxEvent.updateMany({
  where: { id: { in: stuck.map(s => s.id) } },
  data: {
    status: 'PENDING',
    processingAt: null,
    retryCount: { increment: 1 },
    lastError: `Visibility timeout exceeded. Reset at ${new Date().toISOString()}.`,
  },
});
```

This ensures events are never lost — even if the app crashes mid-processing, they return to PENDING on restart.

## 11. DR Drill Schedule

| Drill | Frequency | Owner | Script |
|-------|-----------|-------|--------|
| Backup creation test | Weekly | On-call | `scripts/backup-restore/backup.sh` dry-run |
| Restore to shadow DB | Weekly | On-call | `scripts/restore-test.sh` |
| PITR restore test | Monthly | SRE | `scripts/backup-restore/pitr-restore.sh` |
| Full stack crash drill | Quarterly | SRE | `scripts/backup-restore/dr-drill.sh all` |
| WAL archival continuity | Daily (automated) | On-call | PostgreSQL healthcheck |

---

## 12. RTO / RPO Verification

| Scenario | Target | Last Tested | Result |
|----------|--------|-------------|--------|
| DB restore from backup | RTO < 2h, RPO < 24h | [date] | [PASS/FAIL/PENDING] |
| Point-in-time recovery | RPO < 1 min, RTO < 30 min | [date] | [PASS/FAIL/PENDING] |
| Redis restart | RTO < 1 min | [date] | [PASS/FAIL/PENDING] |
| LINE circuit recovery | RTO < 5 min | [date] | [PASS/FAIL/PENDING] |
| Full region failover | RTO < 15 min, RPO < 5 min | [date] | [PASS/FAIL/PENDING] |
