#!/bin/bash
# =============================================================================
# PostgreSQL Full Backup Script — Apartment ERP
# =============================================================================
# Runs full pg_dump with encryption and optional S3 upload.
#
# Usage:
#   ./backup.sh                        # Local backup with encryption
#   BACKUP_DIR=/backups ./backup.sh   # Custom backup directory
#   DRY_RUN=1 ./backup.sh             # Validate env vars without running
#
# Environment variables:
#   BACKUP_DIR           Local backup directory (default: /app/data/backups)
#   ENCRYPTION_KEY_FILE  Path to file containing AES-256 encryption key
#   S3_BUCKET            S3 bucket for offsite backup (optional)
#   WAL_S3_BUCKET        (From docker-compose) WAL archiving bucket
#   RETENTION_DAYS       Days to keep local backups (default: 30)
#
# Dependencies:
#   - pg_dump (PostgreSQL client)
#   - openssl (AES-256-CBC encryption)
#   - aws (optional, for S3 upload)
#
# Exit codes:
#   0 = backup completed successfully
#   1 = backup failed
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

BACKUP_DIR="${BACKUP_DIR:-/app/data/backups}"
ENCRYPTION_KEY_FILE="${ENCRYPTION_KEY_FILE:-/run/secrets/backup-key}"
S3_BUCKET="${S3_BUCKET:-}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

# PostgreSQL connection (from docker-compose environment)
PGHOST="${PGHOST:-${POSTGRES_HOST:-localhost}}"
PGPORT="${PGPORT:-${POSTGRES_PORT:-5432}}"
PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-test}}"
PGUSER="${PGUSER:-${POSTGRES_USER:-postgres}}"
PGPASSWORD="${PGPASSWORD:-}"

export PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD

# ── Timestamp ──────────────────────────────────────────────────────────────────

DATE=$(date '+%Y-%m-%d_%H%M%S')
DATE_FILESTAMP="${DATE}"          # e.g. 2026-05-05_143052
DUMP_FILE="${BACKUP_DIR}/db_full_${DATE_FILESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.enc"
METADATA_FILE="${DUMP_FILE}.meta.json"

# ── Sanity checks ─────────────────────────────────────────────────────────────

if [[ "${DRY_RUN:-}" == "1" ]]; then
  echo "[DRY RUN] Would run backup with:"
  echo "  BACKUP_DIR    : ${BACKUP_DIR}"
  echo "  PGHOST        : ${PGHOST}:${PGPORT}"
  echo "  PGDATABASE    : ${PGDATABASE}"
  echo "  PGUSER        : ${PGUSER}"
  echo "  ENCRYPTION    : $(test -f "${ENCRYPTION_KEY_FILE}" && echo 'key file present' || echo 'KEY FILE MISSING')"
  echo "  S3_BUCKET     : ${S3_BUCKET:-'(none — local only)'}"
  echo "  RETENTION_DAYS: ${RETENTION_DAYS}"
  exit 0
fi

if [[ -z "${PGPASSWORD}" ]] && [[ -z "${DATABASE_URL}" ]]; then
  echo "ERROR: Neither PGPASSWORD nor DATABASE_URL is set" >&2
  exit 1
fi

# Resolve encryption key
if [[ ! -f "${ENCRYPTION_KEY_FILE}" ]]; then
  echo "ERROR: Encryption key file not found: ${ENCRYPTION_KEY_FILE}" >&2
  echo "  Create with: head -c 32 /dev/urandom | base64 > ${ENCRYPTION_KEY_FILE}"
  exit 1
fi

# ── Setup ──────────────────────────────────────────────────────────────────────

mkdir -p "${BACKUP_DIR}"

# ── Step 1: pg_dump ───────────────────────────────────────────────────────────

echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Starting full database backup"
echo "  Database : ${PGDATABASE}@${PGHOST}:${PGPORT}"
echo "  Output   : ${DUMP_FILE}"

# Use custom format (-Fc) for parallel restore support and compression
if ! pg_dump \
  --host="${PGHOST}" \
  --port="${PGPORT}" \
  --username="${PGUSER}" \
  --dbname="${PGDATABASE}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="${DUMP_FILE}.tmp" \
  2>&1; then
  echo "ERROR: pg_dump failed" >&2
  rm -f "${DUMP_FILE}.tmp"
  exit 1
fi

mv "${DUMP_FILE}.tmp" "${DUMP_FILE}"
DUMP_SIZE=$(stat --format=%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}" 2>/dev/null || echo 0)
echo "[$(date '+%Y-%m-%dT%H:%M:%S')] pg_dump complete — ${DUMP_SIZE} bytes"

# ── Step 2: Encrypt ───────────────────────────────────────────────────────────

echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Encrypting backup (AES-256-CBC)"

if ! openssl enc -aes-256-cbc -salt -pbkdf2 \
  -iter 100000 \
  -in "${DUMP_FILE}" \
  -out "${ENCRYPTED_FILE}" \
  -pass "file:${ENCRYPTION_KEY_FILE}" \
  2>&1; then
  echo "ERROR: encryption failed" >&2
  rm -f "${DUMP_FILE}" "${ENCRYPTED_FILE}"
  exit 1
fi

rm -f "${DUMP_FILE}"  # Remove plaintext immediately
ENCRYPTED_SIZE=$(stat --format=%s "${ENCRYPTED_FILE}" 2>/dev/null || stat -f%z "${ENCRYPTED_FILE}" 2>/dev/null || echo 0)
echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Encryption complete — ${ENCRYPTED_SIZE} bytes"

# ── Step 3: S3 Upload (optional) ───────────────────────────────────────────────

if [[ -n "${S3_BUCKET}" ]]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Uploading to S3: s3://${S3_BUCKET}/backups/${DATE_FILESTAMP}/"

  S3_KEY="backups/${DATE_FILESTAMP}/db_full_${DATE_FILESTAMP}.dump.enc"

  if command -v aws &>/dev/null; then
    if aws s3 cp \
      --no-progress \
      --metadata "backup-date=${DATE},database=${PGDATABASE}" \
      "${ENCRYPTED_FILE}" \
      "s3://${S3_BUCKET}/${S3_KEY}" \
      2>&1; then
      echo "[$(date '+%Y-%m-%dT%H:%M:%S')] S3 upload successful"
    else
      echo "WARN: S3 upload failed — local backup kept, will retry next run" >&2
    fi
  else
    echo "WARN: aws CLI not found — skipping S3 upload" >&2
  fi
else
  echo "[$(date '+%Y-%m-%dT%H:%M:%S')] S3_BUCKET not set — skipping offsite upload"
fi

# ── Step 4: Write metadata ─────────────────────────────────────────────────────

cat > "${METADATA_FILE}" <<EOF
{
  "type": "full_backup",
  "backupName": "${DATE_FILESTAMP}",
  "timestamp": "${DATE}",
  "database": "${PGDATABASE}",
  "host": "${PGHOST}",
  "port": ${PGPORT},
  "encrypted": true,
  "encryption": "AES-256-CBC+PBKDF2",
  "dumpSizeBytes": ${DUMP_SIZE},
  "encryptedSizeBytes": ${ENCRYPTED_SIZE},
  "retentionDays": ${RETENTION_DAYS},
  "createdAt": "$(date -Iseconds)"
}
EOF

# ── Step 5: Cleanup old backups ─────────────────────────────────────────────────

CUTOFF=$((RETENTION_DAYS * 24 * 3600))
NOW=$(date +%s)

find "${BACKUP_DIR}" -name "db_full_*.dump.enc" -type f 2>/dev/null | while read -r f; do
  FILEAGE=$(($NOW - $(stat --format=%Y "${f}" 2>/dev/null || stat -f%Y "${f}" 2>/dev/null || echo 0)))
  if (( FILEAGE > CUTOFF )); then
    echo "  Removing stale backup: $(basename "${f}")"
    rm -f "${f}" "${f}.meta.json" 2>/dev/null || true
  fi
done

echo "[$(date '+%Y-%m-%dT%H:%M:%S')] Backup completed successfully"
echo "  Encrypted file: ${ENCRYPTED_FILE}"
echo "  Metadata:      ${METADATA_FILE}"

exit 0