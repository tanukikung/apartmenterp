#!/usr/bin/env bash
# =============================================================================
# restore-test.sh — Validate database backup integrity
#
# PURPOSE
#   Restores the most recent pg_dump backup to a shadow database and verifies
#   row counts match the production database. Run weekly (or after any backup).
#   Alerts on stdout/exit-code so CI or a cron job can page on-call.
#
# USAGE
#   ./scripts/restore-test.sh
#   ./scripts/restore-test.sh --backup /path/to/backup.sql.gz
#
# REQUIREMENTS
#   - pg_dump / pg_restore / psql in PATH
#   - PROD_DATABASE_URL  (e.g. postgresql://user:pass@host:5432/prod_db)
#   - BACKUP_DIR         directory where pg_dump writes .sql.gz files
#   - Optional: SHADOW_DATABASE_URL (defaults to prod host, db=restore_test_shadow)
#
# EXIT CODES
#   0 — restore succeeded and row counts match
#   1 — restore failed or row counts diverged
# =============================================================================

set -euo pipefail

PROD_DATABASE_URL="${PROD_DATABASE_URL:-${DATABASE_URL:-}}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/apartment_erp}"
SHADOW_DB_NAME="restore_test_shadow_$$"

# Parse optional --backup flag
BACKUP_FILE=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --backup) BACKUP_FILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [[ -z "$PROD_DATABASE_URL" ]]; then
  echo "❌  PROD_DATABASE_URL / DATABASE_URL is not set" >&2
  exit 1
fi

# Extract connection details from PROD_DATABASE_URL
# postgresql://user:pass@host:port/dbname
PGPROTO="${PROD_DATABASE_URL%%://*}"
REST="${PROD_DATABASE_URL#*://}"
PGUSER="${REST%%:*}"
REST="${REST#*:}"
PGPASSWORD="${REST%%@*}"
REST="${REST#*@}"
PGHOST="${REST%%:*}"
REST="${REST#*:}"
PGPORT="${REST%%/*}"
PGDATABASE="${REST#*/}"

export PGUSER PGPASSWORD PGHOST PGPORT

# ── Find backup file ──────────────────────────────────────────────────────────
if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(ls -t "${BACKUP_DIR}"/*.sql.gz 2>/dev/null | head -1 || true)"
fi

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "❌  No backup file found in ${BACKUP_DIR}. Run a pg_dump first." >&2
  exit 1
fi

echo "🔍  Using backup: ${BACKUP_FILE}"
BACKUP_AGE_HOURS=$(( ( $(date +%s) - $(date -r "$BACKUP_FILE" +%s) ) / 3600 ))
echo "    Age: ${BACKUP_AGE_HOURS}h"

if (( BACKUP_AGE_HOURS > 26 )); then
  echo "⚠️   WARNING: Backup is ${BACKUP_AGE_HOURS}h old (expected ≤ 26h). Check backup job."
fi

# ── Create shadow database ────────────────────────────────────────────────────
echo "🏗️   Creating shadow database: ${SHADOW_DB_NAME}"
psql -d postgres -c "CREATE DATABASE \"${SHADOW_DB_NAME}\";" >/dev/null

cleanup() {
  echo "🧹  Dropping shadow database: ${SHADOW_DB_NAME}"
  psql -d postgres -c "DROP DATABASE IF EXISTS \"${SHADOW_DB_NAME}\";" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# ── Restore ───────────────────────────────────────────────────────────────────
echo "⏳  Restoring backup to shadow database…"
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | psql -d "$SHADOW_DB_NAME" -q
else
  psql -d "$SHADOW_DB_NAME" -q -f "$BACKUP_FILE"
fi
echo "✅  Restore complete"

# ── Row count validation ──────────────────────────────────────────────────────
TABLES=(
  rooms tenants contracts invoices payments
  room_billings billing_periods payment_transactions
  outbox_events audit_logs
)

MISMATCH=0
echo ""
echo "📊  Row count comparison (prod → shadow):"
printf "%-30s %12s %12s %8s\n" "table" "prod" "shadow" "match"
printf "%s\n" "$(printf '─%.0s' {1..65})"

for TABLE in "${TABLES[@]}"; do
  PROD_COUNT=$(psql -d "$PGDATABASE"    -tAc "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "N/A")
  SHADOW_COUNT=$(psql -d "$SHADOW_DB_NAME" -tAc "SELECT COUNT(*) FROM \"${TABLE}\";" 2>/dev/null || echo "N/A")

  if [[ "$PROD_COUNT" == "$SHADOW_COUNT" ]]; then
    MATCH="✅"
  else
    MATCH="❌"
    MISMATCH=$((MISMATCH + 1))
  fi

  printf "%-30s %12s %12s %8s\n" "$TABLE" "$PROD_COUNT" "$SHADOW_COUNT" "$MATCH"
done

echo ""
if (( MISMATCH > 0 )); then
  echo "❌  RESTORE TEST FAILED — ${MISMATCH} table(s) have row count mismatches."
  echo "    This backup may be incomplete or corrupt. Do NOT use for recovery."
  exit 1
else
  echo "✅  RESTORE TEST PASSED — all row counts match."
  echo "    Backup at ${BACKUP_FILE} is verified good."
fi
