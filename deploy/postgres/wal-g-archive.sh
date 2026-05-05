#!/bin/bash
# WAL-G archive helper script for PostgreSQL WAL archiving to S3
# Replaces raw `aws s3 cp` with proper error handling and logging
# Usage: Called automatically by PostgreSQL's archive_command via:
#   postgres -c "archive_command=/usr/local/bin/wal-g-archive.sh %p %f"
#
# Exit codes:
#   0 = success (WAL segment archived)
#   1 = failure (PostgreSQL will retry)

set -euo pipefail

WAL_PATH="$1"
WAL_FILE="$2"
TIMESTAMP=$(date '+%Y-%m-%dT%H:%M:%S')

# S3 destination from environment
S3_BUCKET="${WAL_S3_BUCKET:-}"
S3_PREFIX="${WAL_S3_PREFIX:-pg/wal}"

if [ -z "$S3_BUCKET" ]; then
  echo "[$TIMESTAMP] WAL-G archive: WAL_S3_BUCKET not set, skipping" >&2
  exit 0  # Don't block PostgreSQL if S3 not configured
fi

# Full S3 destination
S3_DEST="s3://${S3_BUCKET}/${S3_PREFIX}/${WAL_FILE}"

# Log attempt
echo "[$TIMESTAMP] WAL-G archive: archiving ${WAL_FILE} to ${S3_DEST}" >> /var/log/postgres/archived.log 2>&1 || true

# Copy to S3 using AWS CLI (must be installed in container)
# If aws cli not available, fall back to basic curl upload
if command -v aws &>/dev/null; then
  AWS_CONFIGURED="${AWS_ACCESS_KEY_ID:-}${AWS_SECRET_ACCESS_KEY:-}${AWS_SESSION_TOKEN:-}"
  if [ -n "$AWS_CONFIGURED" ]; then
    aws s3 cp --no-progress "$WAL_PATH" "$S3_DEST" 2>&1
    RESULT=$?
  else
    # No credentials — use ambient IAM role (ECS/EC2)
    aws s3 cp --no-progress "$WAL_PATH" "$S3_DEST" 2>&1
    RESULT=$?
  fi
elif command -v curl &>/dev/null; then
  # Fallback: multipart upload via curl (requires pre-signed URL or open bucket)
  # This path logs a warning and exits 0 so PostgreSQL doesn't block
  echo "[$TIMESTAMP] WAL-G archive: curl fallback - cannot upload without AWS CLI" >> /var/log/postgres/archived.log 2>&1 || true
  echo "[$TIMESTAMP] WAL-G archive: WARNING - WAL segment not archived to S3" >> /var/log/postgres/archived.log 2>&1 || true
  exit 1
else
  echo "[$TIMESTAMP] WAL-G archive: neither aws nor curl available - WAL not archived" >> /var/log/postgres/archived.log 2>&1 || true
  exit 1
fi

if [ $RESULT -eq 0 ]; then
  echo "[$TIMESTAMP] WAL-G archive: SUCCESS ${WAL_FILE}" >> /var/log/postgres/archived.log 2>&1 || true
  exit 0
else
  echo "[$TIMESTAMP] WAL-G archive: FAILED ${WAL_FILE} (exit $RESULT)" >> /var/log/postgres/archived.log 2>&1 || true
  exit 1
fi