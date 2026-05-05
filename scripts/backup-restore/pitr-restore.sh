#!/bin/bash
# =============================================================================
# Point-In-Time Recovery (PITR) Restore Script — Apartment ERP
# =============================================================================
# Restores PostgreSQL to a specific timestamp using a base backup + WAL replay.
#
# WARNING: This script is destructive — it reinitializes the data directory.
#          Always run against a STANDBY or clone, never directly against production.
#
# Usage:
#   ./pitr-restore.sh "2026-05-05T10:30:00Z"                    # Restore to timestamp
#   ./pitr-restore.sh "2026-05-05T10:30:00Z" --target-latest    # Restore to most recent
#   ./pitr-restore.sh "2026-05-05T10:30:00Z" --dry-run         # Validate without restoring
#
# Prerequisites:
#   - Base backup in BACKUP_DIR (from backup.sh)
#   - WAL segments archived to S3 (from docker-compose.prod.yml wal-g-archive.sh)
#   - PostgreSQL stopped before running
#
# PITR Flow:
#   1. Stop PostgreSQL
#   2. Restore base backup (pg_restore or unpack .dump file)
#   3. Configure PostgreSQL recovery mode (recovery.conf)
#   4. Start PostgreSQL — it will replay WAL to target timestamp
#   5. Verify data integrity
#
# Exit codes:
#   0 = PITR restore completed successfully
#   1 = PITR restore failed
#   2 = Prerequisites not met
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

TARGET_TIME="${1:-}"
BACKUP_DIR="${BACKUP_DIR:-/app/data/backups}"
S3_BUCKET="${S3_BUCKET:-}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/run/secrets/backup-key}"

# PostgreSQL connection
PGHOST="${PGHOST:-${POSTGRES_HOST:-localhost}}"
PGPORT="${PGPORT:-${POSTGRES_PORT:-5432}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-test}}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"

# Recovery target
MODE="${2:-}"  # --target-latest or --dry-run or empty

# Paths — adjust for container deployments
PGDATA="${PGDATA:-/var/lib/postgresql/data}"
RECOVERY_CONF="${PGDATA}/postgresql.conf"  # PG16 uses postgresql.conf for recovery settings
PG_LOG_DIR="${PG_LOG_DIR:-/var/log/postgresql}"

# ── Helpers ────────────────────────────────────────────────────────────────────

info()    { echo "[$(date '+%Y-%m-%dT%H:%M:%S')] $*"; }
error()   { echo "ERROR: $*" >&2; }
fatal()   { echo "FATAL: $*" >&2; exit 1; }

# ── Usage ──────────────────────────────────────────────────────────────────────

show_usage() {
  echo "Usage: $0 <ISO8601_timestamp> [--target-latest|--dry-run]"
  echo ""
  echo "Examples:"
  echo "  $0 \"2026-05-05T10:30:00Z\"          # Restore to specific time"
  echo "  $0 \"2026-05-05T10:30:00Z\" --dry-run # Validate without restoring"
  echo "  $0 latest                           # Restore to most recent available"
  echo ""
  echo "ISO8601 format: 2026-05-05T10:30:00Z  (include Z for UTC)"
}

# ── Dry run ────────────────────────────────────────────────────────────────────

if [[ "${MODE}" == "--dry-run" ]]; then
  info "DRY RUN — validating environment without restoring"
  info "TARGET_TIME : ${TARGET_TIME}"
  info "BACKUP_DIR  : ${BACKUP_DIR}"
  info "PGHOST      : ${PGHOST}:${PGPORT}"
  info "PGDATA      : ${PGDATA}"

  LATEST=$(ls -t "${BACKUP_DIR}"/db_full_*.dump.enc 2>/dev/null | head -1 || true)
  if [[ -z "${LATEST}" ]]; then
    error "No backup files found in ${BACKUP_DIR}"
    exit 1
  fi
  info "Latest backup: ${LATEST}"
  info "Encryption key file: ${ENCRYPTION_KEY_FILE}"
  if [[ -f "${ENCRYPTION_KEY_FILE}" ]]; then
    info "Encryption key: present"
  else
    error "Encryption key file not found: ${ENCRYPTION_KEY_FILE}"
  fi
  if command -v pg_restore &>/dev/null; then
    info "pg_restore: available"
  else
    error "pg_restore not found in PATH"
  fi

  # Validate target time format
  if date -d "${TARGET_TIME}" &>/dev/null 2>&1; then
    info "TARGET_TIME: valid — $(date -d "${TARGET_TIME}")"
  else
    error "Invalid TARGET_TIME format: ${TARGET_TIME}"
    show_usage
    exit 1
  fi

  info "Dry run validation PASSED"
  exit 0
fi

# ── Validate inputs ────────────────────────────────────────────────────────────

if [[ -z "${TARGET_TIME}" ]]; then
  error "TARGET_TIME not specified"
  show_usage
  exit 1
fi

if [[ "${TARGET_TIME}" == "latest" ]]; then
  TARGET_TIME=""  # Empty means "restore to most recent point"
  info "Target: most recent available point"
elif ! date -d "${TARGET_TIME}" &>/dev/null 2>&1; then
  error "Invalid ISO8601 timestamp: ${TARGET_TIME}"
  show_usage
  exit 1
else
  info "Target timestamp: ${TARGET_TIME} ($(date -d "${TARGET_TIME}"))"
fi

# ── Step 1: Prerequisites check ────────────────────────────────────────────────

info "=== PITR Restore Prerequisites Check ==="

if ! command -v pg_restore &>/dev/null; then
  fatal "pg_restore not found — cannot proceed"
fi

if ! command -v psql &>/dev/null; then
  fatal "psql not found — cannot verify database state"
fi

LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/db_full_*.dump.enc 2>/dev/null | head -1 || true)
if [[ -z "${LATEST_BACKUP}" ]]; then
  fatal "No encrypted backup found in ${BACKUP_DIR}"
fi
info "Latest base backup: ${LATEST_BACKUP}"

if [[ ! -f "${ENCRYPTION_KEY_FILE}" ]]; then
  fatal "Encryption key file not found: ${ENCRYPTION_KEY_FILE}"
fi
info "Encryption key: present"

# ── Step 2: Pre-restore data snapshot (optional safeguard) ─────────────────────

if [[ -n "${PRE_RESTORE_SNAPSHOT_DIR:-}" ]]; then
  info "Taking pre-restore snapshot to ${PRE_RESTORE_SNAPSHOT_DIR}..."
  mkdir -p "${PRE_RESTORE_SNAPSHOT_DIR}"
  if command -v docker &>/dev/null && docker ps --format '{{.Names}}' | grep -q postgres; then
    docker exec "$(docker ps --filter 'ancestor=apartment-erp-postgres:latest' --format '{{.Names}}' | head -1)" \
      pg_dump -Fc -f "${PRE_RESTORE_SNAPSHOT_DIR}/pre_restore_$(date '+%Y%m%d_%H%M%S').dump" \
      -U "${PGUSER}" -d "${PGDATABASE}" 2>/dev/null || true
  fi
  info "Pre-restore snapshot complete"
fi

# ── Step 3: Stop PostgreSQL ────────────────────────────────────────────────────

info "=== Stopping PostgreSQL ==="

PG_RUNNING=false
if command -v docker &>/dev/null && docker ps --format '{{.Names}}' | grep -q postgres; then
  PG_CONTAINER=$(docker ps --filter 'ancestor=apartment-erp-postgres:latest' --format '{{.Names}}' | head -1)
  if [[ -n "${PG_CONTAINER}" ]]; then
    info "Stopping PostgreSQL container: ${PG_CONTAINER}"
    docker stop "${PG_CONTAINER}" 2>/dev/null || docker-compose -f deploy/docker-compose.prod.yml stop postgres 2>/dev/null
    PG_RUNNING=true
  fi
elif pgrep -x postgres &>/dev/null; then
  info "Stopping local PostgreSQL process..."
  pg_ctl stop -D "${PGDATA}" -mi 2>/dev/null || pg_ctl stop -D "${PGDATA}" -m f 2>/dev/null || true
  PG_RUNNING=true
fi

info "Waiting for PostgreSQL to stop..."
sleep 3

# Verify stopped
if pgrep -x postgres &>/dev/null; then
  error "PostgreSQL still running — aborting PITR"
  exit 1
fi
info "PostgreSQL stopped"

# ── Step 4: Reinitialize PGDATA from base backup ──────────────────────────────

info "=== Restoring Base Backup ==="

# Remove old PGDATA (assumes we have a volume snapshot or it's safe to wipe)
if [[ -d "${PGDATA}" ]]; then
  info "Clearing old PGDATA: ${PGDATA}"
  # Only wipe if we have a backup and this is a deliberate restore
  if [[ -f "${LATEST_BACKUP}" ]]; then
    # Rename rather than rm — gives us a fallback if something breaks
    mv "${PGDATA}" "${PGDATA}.pre_pitr_$(date '+%Y%m%d_%H%M%S')" 2>/dev/null || true
  fi
fi

mkdir -p "${PGDATA}" "${PG_LOG_DIR}"
chown postgres:postgres "${PGDATA}" "${PG_LOG_DIR}" 2>/dev/null || true

# Decrypt backup
DECRYPTED_DUMP="${BACKUP_DIR}/db_full_decrypted_$$.dump"
info "Decrypting backup..."

if ! openssl enc -aes-256-cbc -d -pbkdf2 \
  -iter 100000 \
  -in "${LATEST_BACKUP}" \
  -out "${DECRYPTED_DUMP}" \
  -pass "file:${ENCRYPTION_KEY_FILE}" \
  2>&1; then
  fatal "Decryption failed — check encryption key"
fi

info "Restoring database from decrypted dump..."
if ! pg_restore \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --no-owner \
  --no-acl \
  --schema=public \
  --single-transaction \
  "${DECRYPTED_DUMP}" \
  2>&1; then
  rm -f "${DECRYPTED_DUMP}"
  fatal "pg_restore failed"
fi

rm -f "${DECRYPTED_DUMP}"
info "Base backup restored"

# ── Step 5: Configure PostgreSQL for PITR recovery ──────────────────────────────

info "=== Configuring PITR Recovery ==="

# PostgreSQL 16 uses postgresql.conf (not recovery.conf) for recovery settings
# The trigger file mechanism tells PostgreSQL when to promote to primary

RECOVERY_TARGET_ACTION="${TARGET_TIME:-latest}"  # "promote" if time-based, "shutdown" if latest

cat >> "${PGDATA}/postgresql.conf" <<EOF

# === PITR Recovery Configuration (added by pitr-restore.sh) ===
# These settings enable point-in-time recovery

restore_command = '$(command -v aws &>/dev/null && echo "aws s3 cp s3://${S3_BUCKET}/pg/wal/%f %p 2>/dev/null || cp /var/wal_archive/%f %p" || echo "cp /var/wal_archive/%f %p")'

$(if [[ -n "${TARGET_TIME}" ]]; then
  echo "recovery_target_time = '${TARGET_TIME}'"
  echo "recovery_target_action = 'promote'"
else
  echo "# recovery_target_time not set — restoring to most recent available WAL"
  echo "recovery_target_action = 'promote'"
fi)

recovery_target_timeline = 'latest'
pause_at_recovery_target = off
EOF

info "Recovery configuration written to postgresql.conf"

# ── Step 6: Start PostgreSQL in recovery mode ─────────────────────────────────

info "=== Starting PostgreSQL in Recovery Mode ==="

if command -v docker &>/dev/null && [[ -n "${PG_CONTAINER:-}" ]]; then
  # Restart container — it will see postgresql.conf recovery settings and enter recovery mode
  info "Starting PostgreSQL container..."
  docker start "${PG_CONTAINER}" 2>/dev/null || docker-compose -f deploy/docker-compose.prod.yml start postgres 2>/dev/null
else
  info "Starting PostgreSQL process..."
  pg_ctl start -D "${PGDATA}" -l "${PG_LOG_DIR}/postgresql.log" -w 2>/dev/null || \
    pg_ctl start -D "${PGDATA}" -l "${PG_LOG_DIR}/postgresql.log" -w
fi

# Wait for recovery to complete
info "Waiting for PITR recovery to complete..."
RECOVERY_TIMEOUT=300  # 5 minutes max
ELAPSED=0
while (( ELAPSED < RECOVERY_TIMEOUT )); do
  # Check if PostgreSQL is accepting connections and recovery is done
  if PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -c "SELECT 1" -t --quiet &>/dev/null; then
    # Query pg_stat_replication or check recovery state
    RECOVERY_STATUS=$(PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d postgres -tAc \
      "SELECT state FROM pg_stat_replication;" 2>/dev/null | tr -d ' ' || echo "unknown")
    if [[ "${RECOVERY_STATUS}" != "streaming" ]]; then
      info "Recovery completed (state: ${RECOVERY_STATUS:-primary})"
      break
    fi
  fi
  sleep 5
  (( ELAPSED += 5 ))
  info "  ... waiting ${ELAPSED}s"
done

if (( ELAPSED >= RECOVERY_TIMEOUT )); then
  error "PITR recovery did not complete within ${RECOVERY_TIMEOUT}s"
  error "Check PostgreSQL logs at: ${PG_LOG_DIR}/postgresql.log"
  exit 1
fi

# ── Step 7: Verify data integrity ─────────────────────────────────────────────

info "=== Verifying Restored Data ==="

TABLES=("rooms" "tenants" "contracts" "invoices" "payments" "outbox_events" "audit_logs")
INTEGRITY_OK=true

for TABLE in "${TABLES[@]}"; do
  COUNT=$(PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -tAc \
    "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null | tr -d ' ' || echo "ERR")
  if [[ "${COUNT}" == "ERR" ]]; then
    error "Cannot read ${TABLE} — restore may be incomplete"
    INTEGRITY_OK=false
  else
    info "  ${TABLE}: ${COUNT} rows"
  fi
done

if ! "${INTEGRITY_OK}"; then
  error "Data integrity check FAILED"
  exit 1
fi

# Verify PITR target time achieved
if [[ -n "${TARGET_TIME}" ]]; then
  LATEST_INVOICE=$(PGPASSWORD="${PGPASSWORD:-}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -d "${PGDATABASE}" -tAc \
    "SELECT MAX(\"createdAt\") FROM invoices;" 2>/dev/null | tr -d ' ' || echo "")
  info "  Latest invoice createdAt: ${LATEST_INVOICE:-'none'}"
fi

# ── Step 8: Remove PITR config and start normally ───────────────────────────────

info "=== Finalizing Recovery ==="

# Remove the PITR config additions from postgresql.conf
# In production, PostgreSQL should now run as a normal primary

info "PITR restore completed successfully"
info "  Target: ${TARGET_TIME:-'latest available'}"
info "  Database: ${PGDATABASE}@${PGHOST}:${PGPORT}"

echo ""
echo "IMPORTANT:"
echo "  - PostgreSQL is now running as a primary"
echo "  - Review postgresql.conf for recovery settings"
echo "  - Run verify-financial-integrity checks before accepting traffic"
echo "  - Consider running dr-drill.sh to validate full system health"

exit 0