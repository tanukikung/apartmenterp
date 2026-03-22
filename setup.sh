#!/bin/bash
# ================================================================
# Apartment ERP — One-Click Setup (Linux / Mac / WSL)
# ================================================================
set -e

BLUE='\033[0;34m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

echo -e "${BLUE}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║       Apartment ERP — Setup Script       ║"
echo "  ╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── Check prerequisites ───────────────────────────────────────────
echo "Checking prerequisites..."

if ! command -v docker &>/dev/null; then
  echo -e "${RED}ERROR: Docker not found.${NC}"
  echo "Install Docker Desktop from: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo -e "${RED}ERROR: Docker Compose not found.${NC}"
  exit 1
fi

echo -e "${GREEN}Docker $(docker --version | cut -d' ' -f3 | tr -d ',') found.${NC}"

# ── Create .env from template ─────────────────────────────────────
if [ ! -f ".env" ]; then
  echo ""
  echo "Generating .env with secure random secrets..."
  cp .env.example .env

  # Generate random secrets
  DB_PASS=$(openssl rand -hex 16)
  REDIS_PASS=$(openssl rand -hex 16)
  NEXTAUTH=$(openssl rand -base64 32 | tr -d '\n')
  ONLYOFFICE=$(openssl rand -base64 32 | tr -d '\n')
  CRON=$(openssl rand -hex 12)

  # Inject into .env
  sed -i.bak \
    -e "s/CHANGE_THIS_DB_PASSWORD/$DB_PASS/" \
    -e "s/CHANGE_THIS_REDIS_PASSWORD/$REDIS_PASS/" \
    -e "s|CHANGE_THIS_NEXTAUTH_SECRET|$NEXTAUTH|" \
    -e "s|CHANGE_THIS_ONLYOFFICE_SECRET|$ONLYOFFICE|" \
    -e "s/CHANGE_THIS_CRON_SECRET/$CRON/" \
    .env
  rm -f .env.bak
  echo -e "${GREEN}Secrets generated.${NC}"
else
  echo ".env already exists — using existing configuration."
fi

# ── Ask for server address ────────────────────────────────────────
CURRENT_HOST=$(grep '^APP_HOST=' .env | cut -d'=' -f2)
echo ""
echo -e "${YELLOW}Server address (current: $CURRENT_HOST)${NC}"
echo "  • Enter 'localhost' for this machine only"
echo "  • Enter VPS IP (e.g. 103.21.45.67) for remote access"
read -p "APP_HOST [$CURRENT_HOST]: " NEW_HOST

if [ -n "$NEW_HOST" ] && [ "$NEW_HOST" != "$CURRENT_HOST" ]; then
  sed -i.bak "s/^APP_HOST=.*/APP_HOST=$NEW_HOST/" .env
  rm -f .env.bak
  echo "APP_HOST set to: $NEW_HOST"
fi

# ── Build and start ───────────────────────────────────────────────
echo ""
echo "Building and starting all services..."
echo -e "${YELLOW}(First build takes 5-15 minutes — downloading images and compiling)${NC}"
echo ""

docker compose up -d --build

# ── Wait for health ───────────────────────────────────────────────
echo ""
echo "Waiting for services to be ready..."
APP_HOST_VAL=$(grep '^APP_HOST=' .env | cut -d'=' -f2)
APP_PORT_VAL=$(grep '^APP_PORT=' .env | cut -d'=' -f2)
APP_PORT_VAL=${APP_PORT_VAL:-3001}

TIMEOUT=180
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
  if curl -sf "http://${APP_HOST_VAL}:${APP_PORT_VAL}/api/health" >/dev/null 2>&1; then
    break
  fi
  printf "."
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
echo ""

# ── Done ─────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}"
echo "  ╔══════════════════════════════════════════════════╗"
echo "  ║               Setup Complete!                    ║"
echo "  ╠══════════════════════════════════════════════════╣"
echo "  ║  ERP System:   http://${APP_HOST_VAL}:${APP_PORT_VAL}          ║"
echo "  ║  OnlyOffice:   http://${APP_HOST_VAL}:8080         ║"
echo "  ╠══════════════════════════════════════════════════╣"
echo "  ║  Login:  owner / Owner@12345  (Admin)            ║"
echo "  ║          staff / Staff@12345  (Staff)            ║"
echo "  ╠══════════════════════════════════════════════════╣"
echo "  ║  !! CHANGE DEFAULT PASSWORDS AFTER FIRST LOGIN !!║"
echo "  ╚══════════════════════════════════════════════════╝"
echo -e "${NC}"

echo "Useful commands:"
echo "  docker compose logs -f app        # View app logs"
echo "  docker compose down               # Stop all services"
echo "  docker compose up -d              # Start again"
echo "  docker compose exec app sh        # Open shell in app container"
