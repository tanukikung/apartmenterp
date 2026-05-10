#!/bin/sh
set -e

DATA_ROOT="${APP_DATA_DIR:-/app/data}"
UPLOAD_ROOT="${UPLOAD_DIR:-$DATA_ROOT/uploads}"
BACKUP_ROOT="${BACKUP_DIR:-$DATA_ROOT/backups}"
LOG_ROOT="${LOG_DIR:-$DATA_ROOT/logs}"

mkdir -p "$DATA_ROOT" "$UPLOAD_ROOT" "$BACKUP_ROOT" "$LOG_ROOT"

echo ""
echo "========================================"
echo "      Apartment ERP Starting..."
echo "========================================"
echo ""

# Step 1: Run database migrations
echo "[ 1/3 ] Running database migrations..."
npx prisma migrate deploy
echo "        Migrations complete."

# Step 2: Auto-seed on first startup
echo "[ 2/3 ] Checking if seeding is needed..."

USER_COUNT=$(node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.adminUser.count()
  .then(n => { process.stdout.write(String(n)); return p.\$disconnect(); })
  .catch(() => { process.stdout.write('0'); });
" 2>/dev/null || echo "0")

if [ "${USER_COUNT:-0}" = "0" ]; then
  echo "        First startup detected - seeding database..."
  npx tsx prisma/seed.ts
  echo ""
  echo "  -----------------------------------------"
  echo "  Initial admin users created:"
  echo "  Admin: owner"
  echo "  Staff: staff"
  echo "  Passwords were supplied via SEED_* env vars."
  echo "  Change these passwords immediately."
  echo "  -----------------------------------------"
  echo ""
else
  echo "        Database already has data - skipping seed."
fi

# Step 3: Start application
echo "[ 3/3 ] Starting application on port ${PORT:-3000}..."
echo ""
exec "$@"
