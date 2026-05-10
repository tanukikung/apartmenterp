#!/usr/bin/env sh
set -eu

ACTION="${1:-up}"
BASE_URL="${2:-http://localhost:3000}"
APP_PORT="${3:-3000}"

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.customer.yml"
TEMPLATE_FILE="$ROOT_DIR/.env.customer.example"
ENV_FILE="$ROOT_DIR/.env.customer"

get_env_value() {
  key="$1"
  if [ ! -f "$ENV_FILE" ]; then
    return 1
  fi

  awk -F= -v target="$key" '$1 == target { print substr($0, index($0, "=") + 1); exit }' "$ENV_FILE"
}

new_hex_secret() {
  bytes="${1:-32}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
    return
  fi

  python - "$bytes" <<'PY'
import os
import sys
print(os.urandom(int(sys.argv[1])).hex())
PY
}

init_env() {
  if [ -f "$ENV_FILE" ]; then
    echo ".env.customer already exists at $ENV_FILE"
    return
  fi

  if [ ! -f "$TEMPLATE_FILE" ]; then
    echo "Missing template file: $TEMPLATE_FILE" >&2
    exit 1
  fi

  cookie_secure="false"
  case "$BASE_URL" in
    https://*) cookie_secure="true" ;;
  esac

  postgres_password="$(new_hex_secret 18)"
  nextauth_secret="$(new_hex_secret 32)"
  cron_secret="$(new_hex_secret 32)"
  invoice_access_secret="$(new_hex_secret 32)"
  file_access_secret="$(new_hex_secret 32)"
  owner_password="$(new_hex_secret 12)"
  staff_password="$(new_hex_secret 12)"

  sed \
    -e "s|__APP_BASE_URL__|$BASE_URL|g" \
    -e "s|__APP_PORT__|$APP_PORT|g" \
    -e "s|__POSTGRES_PASSWORD__|$postgres_password|g" \
    -e "s|__NEXTAUTH_SECRET__|$nextauth_secret|g" \
    -e "s|__CRON_SECRET__|$cron_secret|g" \
    -e "s|__INVOICE_ACCESS_SECRET__|$invoice_access_secret|g" \
    -e "s|__FILE_ACCESS_SECRET__|$file_access_secret|g" \
    -e "s|__SEED_OWNER_PASSWORD__|$owner_password|g" \
    -e "s|__SEED_STAFF_PASSWORD__|$staff_password|g" \
    -e "s|__COOKIE_SECURE__|$cookie_secure|g" \
    "$TEMPLATE_FILE" > "$ENV_FILE"

  echo "Created .env.customer with generated secrets."
  echo "Initial admin credentials:"
  echo "  owner / $owner_password"
  echo "  staff / $staff_password"
  echo "Review $ENV_FILE before first deploy if you need a custom domain, LINE, or S3."
}

assert_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. Please install Docker first." >&2
    exit 1
  fi

  docker compose version >/dev/null
  docker info >/dev/null 2>&1 || {
    echo "Docker daemon is not running. Start Docker and try again." >&2
    exit 1
  }
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

case "$ACTION" in
  init)
    init_env
    ;;
  up)
    init_env
    assert_docker
    compose up -d --build
    app_url="$(get_env_value APP_BASE_URL || printf '%s' "$BASE_URL")"
    echo ""
    echo "Apartment ERP is starting."
    echo "Open: $app_url"
    echo "Initial admin credentials are stored in $ENV_FILE"
    ;;
  down)
    [ -f "$ENV_FILE" ] || { echo ".env.customer not found. Run init first." >&2; exit 1; }
    assert_docker
    compose down
    ;;
  restart)
    [ -f "$ENV_FILE" ] || { echo ".env.customer not found. Run init first." >&2; exit 1; }
    assert_docker
    compose up -d --build
    ;;
  logs)
    [ -f "$ENV_FILE" ] || { echo ".env.customer not found. Run init first." >&2; exit 1; }
    assert_docker
    compose logs -f app
    ;;
  status)
    [ -f "$ENV_FILE" ] || { echo ".env.customer not found. Run init first." >&2; exit 1; }
    assert_docker
    compose ps
    ;;
  *)
    echo "Usage: scripts/customer-stack.sh [init|up|down|restart|logs|status] [base-url] [app-port]" >&2
    exit 1
    ;;
esac
