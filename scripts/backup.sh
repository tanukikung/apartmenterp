#!/bin/bash
# =============================================================================
# PostgreSQL Backup Script — Apartment ERP
# =============================================================================
# Usage: ./scripts/backup.sh [backup_name]
#   backup_name  Optional name suffix (default: YYYY-MM-DD_HHMMSS)
#
# Requires: pg_dump, gzip, psql (in PATH)
# =============================================================================

set -euo pipefail

# --- Config ---
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-test}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-anand37048}"

BACKUP_DIR="${BACKUP_DIR:-./backups}"
MAX_KEEP="${MAX_KEEP:-30}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

# --- Timestamp ---
TIMESTAMP="$(date '+%Y-%m-%d_%H%M%S')"
BACKUP_NAME="${1:-${TIMESTAMP}}"
BACKUP_FILE="${BACKUP_DIR}/apartment_erp_${BACKUP_NAME}.sql.gz"

# --- Create backup dir ---
mkdir -p "${BACKUP_DIR}"

# --- Dump ---
echo "=== BACKUP STARTED at $(date) ==="
echo "Database: ${PGDATABASE}@${PGHOST}:${PGPORT}"
echo "Output:   ${BACKUP_FILE}"

pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="${BACKUP_FILE}.tmp"

mv "${BACKUP_FILE}.tmp" "${BACKUP_FILE}"

# --- Store metadata ---
echo "{
  \"backupName\": \"${BACKUP_NAME}\",
  \"timestamp\": \"${TIMESTAMP}\",
  \"database\": \"${PGDATABASE}\",
  \"host\": \"${PGHOST}\",
  \"port\": ${PGPORT},
  \"sizeBytes\": $(stat -c%s "${BACKUP_FILE}"),
  \"createdAt\": \"$(date -Iseconds)\"
}" > "${BACKUP_FILE}.meta.json"

echo "Size: $(du -h "${BACKUP_FILE}" | cut -f1)"

# --- Cleanup old backups (keep MAX_KEEP) ---
if command -v psql &>/dev/null; then
  BACKUPS_COUNT="$(ls -1 "${BACKUP_DIR}"/apartment_erp_*.sql.gz 2>/dev/null | wc -l || echo 0)"
  if [ "${BACKUPS_COUNT}" -gt "${MAX_KEEP}" ]; then
    echo ""
    echo "Cleaning up old backups (keeping ${MAX_KEEP})..."
    ls -1t "${BACKUP_DIR}"/apartment_erp_*.sql.gz | tail -n +$((MAX_KEEP + 1)) | xargs -r rm
    echo "Done."
  fi
fi

echo "=== BACKUP COMPLETED at $(date) ==="
echo "File: ${BACKUP_FILE}"