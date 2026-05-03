#!/bin/bash
# =============================================================================
# PostgreSQL Restore Script — Apartment ERP
# =============================================================================
# Usage: ./scripts/restore.sh <backup_file> [--dry-run]
#   backup_file  Path to .sql.gz or .dump file
#   --dry-run    Show what would be restored without executing
#
# WARNING: This drops and recreates the database!
# =============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"
DRY_RUN="${2:-}"

if [ -z "${BACKUP_FILE}" ]; then
  echo "Usage: $0 <backup_file> [--dry-run]"
  echo ""
  echo "Available backups:"
  ls -lh ./backups/apartment_erp_*.sql.gz 2>/dev/null || echo "  (no backups found in ./backups)"
  exit 1
fi

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

# --- Config ---
PGHOST="${PGHOST:-localhost}"
PGPORT="${PGPORT:-5432}"
PGDATABASE="${PGDATABASE:-test}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-anand37048}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

echo "=== RESTORE WARNING ==="
echo "This will DROP and RECREATE the database: ${PGDATABASE}"
echo "Backup file: ${BACKUP_FILE}"
echo "========================"

if [ "${DRY_RUN}" = "--dry-run" ]; then
  echo "[DRY RUN] Would restore:"
  gzip -dc "${BACKUP_FILE}" | head -50
  exit 0
fi

echo "Type 'yes' to confirm: "
read -r CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "Aborted."
  exit 1
fi

echo "Dropping existing database..."
PGPASSWORD="${PGPASSWORD}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "DROP DATABASE IF EXISTS \"${PGDATABASE}\";"
PGPASSWORD="${PGPASSWORD}" psql -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" -c "CREATE DATABASE \"${PGDATABASE}\";"

echo "Restoring from backup..."
if [[ "${BACKUP_FILE}" == *.gz ]]; then
  gzip -dc "${BACKUP_FILE}" | PGPASSWORD="${PGPASSWORD}" pg_restore \
    --host="${PGHOST}" \
    --port="${PGPORT}" \
    --username="${PGUSER}" \
    --dbname="${PGDATABASE}" \
    --no-owner \
    --no-acl \
    --schema=public
else
  PGPASSWORD="${PGPASSWORD}" pg_restore \
    --host="${PGHOST}" \
    --port="${PGPORT}" \
    --username="${PGUSER}" \
    --dbname="${PGDATABASE}" \
    --no-owner \
    --no-acl \
    --schema=public \
    "${BACKUP_FILE}"
fi

echo "=== RESTORE COMPLETED ==="