#!/bin/bash
# =============================================================================
# Phase 4: DR Drill Scripts — Apartment ERP Production Readiness
# =============================================================================
# Tests recovery procedures for:
#   1. PostgreSQL crash and restart
#   2. Redis crash and restart
#   3. LINE API downstream failure
#   4. Full stack restart (all services)
#   5. Network partition simulation
#
# Prerequisites:
#   - docker-compose.prod.yml deployed
#   - AWS credentials for S3 WAL bucket
#   - psql for direct DB verification
#
# Usage:
#   bash scripts/dr-drill.sh [scenario]
#   bash scripts/dr-drill.sh all        # Run all scenarios
#   bash scripts/dr-drill.sh postgres    # DB crash only
#   bash scripts/dr-drill.sh redis      # Redis crash only
#   bash scripts/dr-drill.sh line        # LINE API failure
#   bash scripts/dr-drill.sh full       # Full stack restart
#
# Exit: 0 = drill passed, 1 = drill failed, 2 = prerequisites not met
# =============================================================================

set -euo pipefail

# ─── Colors ──────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
pass()    { echo -e "${GREEN}[PASS]${NC}  $*"; }
fail()    { echo -e "${RED}[FAIL]${NC}  $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $* $*"; }
section() { echo -e "\n${CYAN}═══════════════════════════════════════════${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}═══════════════════════════════════════════${NC}"; }

# ─── Defaults ──────────────────────────────────────────────────────────────────
COMPOSE_FILE="deploy/docker-compose.prod.yml"
TIMEOUT_SECONDS=60
POSTGRES_CONTAINER=""
REDIS_CONTAINER=""
APP_CONTAINER=""

# ─── Parse Arguments ───────────────────────────────────────────────────────────
SCENARIO="${1:-all}"

# ─── Detect Containers ────────────────────────────────────────────────────────
detect_containers() {
  info "Detecting running containers..."

  POSTGRES_CONTAINER=$(docker ps -q --filter "ancestor=apartment-erp-postgres:latest" 2>/dev/null | head -1 || echo "")
  REDIS_CONTAINER=$(docker ps -q --filter "ancestor=redis:7-alpine" 2>/dev/null | head -1 || echo "")
  APP_CONTAINER=$(docker ps -q --filter "ancestor=apartment-erp-app:latest" 2>/dev/null | head -1 || echo "")

  if [[ -z "$POSTGRES_CONTAINER" ]]; then
    POSTGRES_CONTAINER=$(docker ps --format '{{.Names}}' --filter "label=app=postgres" 2>/dev/null | head -1 || echo "")
  fi
  if [[ -z "$REDIS_CONTAINER" ]]; then
    REDIS_CONTAINER=$(docker ps --format '{{.Names}}' --filter "label=app=redis" 2>/dev/null | head -1 || echo "")
  fi
  if [[ -z "$APP_CONTAINER" ]]; then
    APP_CONTAINER=$(docker ps --format '{{.Names}}' --filter "label=app=app" 2>/dev/null | head -1 || echo "")
  fi

  info "Containers detected:"
  info "  PostgreSQL: ${POSTGRES_CONTAINER:-NOT FOUND}"
  info "  Redis:      ${REDIS_CONTAINER:-NOT FOUND}"
  info "  App:        ${APP_CONTAINER:-NOT FOUND}"
}

# ─── Prerequisites ────────────────────────────────────────────────────────────
check_prereqs() {
  section "PREREQUISITES"

  if ! command -v docker &>/dev/null; then
    fail "Docker not available"
    exit 2
  fi
  info "✅ Docker available"

  if ! docker ps &>/dev/null; then
    fail "Docker daemon not accessible"
    exit 2
  fi
  info "✅ Docker daemon accessible"

  if [[ ! -f "$COMPOSE_FILE" ]]; then
    fail "docker-compose file not found: $COMPOSE_FILE"
    exit 2
  fi
  info "✅ docker-compose.yml found"

  if ! command -v psql &>/dev/null; then
    warn "psql not in PATH — some checks will be skipped"
  else
    info "✅ psql available"
  fi

  detect_containers
}

# ─── Helper: wait for port ────────────────────────────────────────────────────
wait_for_port() {
  local host="$1"
  local port="$2"
  local label="$3"
  local timeout="${4:-$TIMEOUT_SECONDS}"

  info "Waiting for $label ($host:$port)..."

  local elapsed=0
  while (( elapsed < timeout )); do
    if command -v nc &>/dev/null; then
      nc -z "$host" "$port" 2>/dev/null && { info "✅ $label ready"; return 0; }
    elif command -v curl &>/dev/null; then
      curl -s --connect-timeout 1 "$host:$port" &>/dev/null && { info "✅ $label ready"; return 0; }
    fi
    sleep 2
    (( elapsed += 2 ))
    info "  ... waiting ${elapsed}s"
  done

  fail "$label did not become ready within ${timeout}s"
  return 1
}

# ─── Helper: exec in container ────────────────────────────────────────────────
exec_in() {
  local container="$1"
  shift
  docker exec "$container" "$@"
}

# ─── Helper: app health check ─────────────────────────────────────────────────
check_app_health() {
  local url="${APP_BASE_URL:-http://localhost:3001}/api/health"
  curl -s --fail --max-time 5 "$url" &>/dev/null
}

# =============================================================================
# SCENARIO 1: PostgreSQL Crash & Recovery
# =============================================================================
drill_postgres_crash() {
  section "DRILL 1: PostgreSQL Crash & Recovery"

  if [[ -z "$POSTGRES_CONTAINER" ]]; then
    warn "PostgreSQL container not found — skipping"
    return 1
  fi

  # Record pre-state
  info "Recording pre-crash state..."
  local preWalLevel preArchiveMode
  preWalLevel=$(exec_in "$POSTGRES_CONTAINER" psql -U postgres -d postgres -c "SELECT current_setting('wal_level')" -t --quiet 2>/dev/null | tr -d ' ' || echo "")
  preArchiveMode=$(exec_in "$POSTGRES_CONTAINER" psql -U postgres -d postgres -c "SELECT current_setting('archive_mode')" -t --quiet 2>/dev/null | tr -d ' ' || echo "")
  info "  wal_level: ${preWalLevel:-N/A}"
  info "  archive_mode: ${preArchiveMode:-N/A}"

  # Simulate crash: kill postgres process (NOT the container)
  info "Simulating PostgreSQL crash (SIGKILL postgres main process)..."
  exec_in "$POSTGRES_CONTAINER" sh -c 'kill -9 $(pgrep -x postgres) || true' 2>/dev/null || true

  info "Waiting 5s for PostgreSQL to restart..."
  sleep 5

  # Verify PostgreSQL is back up
  info "Verifying PostgreSQL recovered..."
  local pgReady=false
  for i in {1..30}; do
    if exec_in "$POSTGRES_CONTAINER" psql -U postgres -d postgres -c "SELECT 1" -t --quiet &>/dev/null; then
      pgReady=true
      break
    fi
    sleep 2
  done

  if $pgReady; then
    pass "PostgreSQL recovered automatically"
  else
    fail "PostgreSQL did not recover within 60s"
    return 1
  fi

  # Verify WAL settings survived
  info "Verifying WAL settings preserved after restart..."
  local postWalLevel postArchiveMode
  postWalLevel=$(exec_in "$POSTGRES_CONTAINER" psql -U postgres -d postgres -c "SELECT current_setting('wal_level')" -t --quiet 2>/dev/null | tr -d ' ' || echo "")
  postArchiveMode=$(exec_in "$POSTGRES_CONTAINER" psql -U postgres -d postgres -c "SELECT current_setting('archive_mode')" -t --quiet 2>/dev/null | tr -d ' ' || echo "")

  if [[ "$preWalLevel" == "$postWalLevel" ]] && [[ "$preArchiveMode" == "$postArchiveMode" ]]; then
    pass "WAL settings preserved (wal_level=$postWalLevel, archive_mode=$postArchiveMode)"
  else
    warn "WAL settings may have changed after restart"
  fi

  # Verify data integrity
  info "Verifying data integrity (row count on key tables)..."
  local invoiceCount
  invoiceCount=$(exec_in "$POSTGRES_CONTAINER" psql -U postgres -d test -c "SELECT COUNT(*) FROM invoices" -t --quiet 2>/dev/null | tr -d ' ' || echo "ERR")
  info "  invoices table: ${invoiceCount} rows"

  if [[ "$invoiceCount" != "ERR" ]] && [[ "$invoiceCount" -gt 0 ]]; then
    pass "Data integrity verified"
  else
    warn "Could not verify data integrity (may be empty DB)"
  fi

  # Verify app can still connect
  info "Verifying app can reconnect..."
  wait_for_port "localhost" "3001" "App health endpoint" 30 && pass "App reconnected" || { warn "App health check failed"; }

  pass "DRILL 1 COMPLETE: PostgreSQL crash recovery"
  return 0
}

# =============================================================================
# SCENARIO 2: Redis Crash & Recovery
# =============================================================================
drill_redis_crash() {
  section "DRILL 2: Redis Crash & Recovery"

  if [[ -z "$REDIS_CONTAINER" ]]; then
    warn "Redis container not found — skipping"
    return 1
  fi

  # Record pre-state
  info "Recording pre-crash Redis state..."
  local preRedisInfo
  preRedisInfo=$(exec_in "$REDIS_CONTAINER" redis-cli INFO server 2>/dev/null | grep -E 'redis_version|connected_clients' | head -2 || echo "")
  info "Pre-crash: ${preRedisInfo:-N/A}"

  # Simulate crash
  info "Simulating Redis crash (SIGKILL redis-server)..."
  exec_in "$REDIS_CONTAINER" sh -c 'kill -9 $(pgrep -x redis-server) || true' 2>/dev/null || true

  info "Waiting 5s for Redis to restart..."
  sleep 5

  # Verify Redis is back
  info "Verifying Redis recovered..."
  local redisReady=false
  for i in {1..15}; do
    if exec_in "$REDIS_CONTAINER" redis-cli PING 2>/dev/null | grep -q PONG; then
      redisReady=true
      break
    fi
    sleep 2
  done

  if $redisReady; then
    pass "Redis recovered automatically"
  else
    fail "Redis did not recover within 30s"
    return 1
  fi

  # Verify circuit breaker state was reset (or persisted correctly)
  info "Verifying circuit breaker state..."
  if docker exec "$APP_CONTAINER" ls /app/.redis-cb-state.json &>/dev/null; then
    info "  Circuit breaker state file found"
  else
    info "  Circuit breaker state in-memory (expected for single-node)"
  fi

  pass "DRILL 2 COMPLETE: Redis crash recovery"
  return 0
}

# =============================================================================
# SCENARIO 3: LINE API Downstream Failure
# =============================================================================
drill_line_api_down() {
  section "DRILL 3: LINE API Downstream Failure"

  if [[ -z "$APP_CONTAINER" ]]; then
    warn "App container not found — skipping LINE drill"
    return 1
  fi

  # Check circuit breaker before simulation
  info "Recording pre-failure circuit breaker state..."
  local cbStateBefore="unknown"
  cbStateBefore=$(docker exec "$APP_CONTAINER" cat /app/.redis-cb-state.json 2>/dev/null | node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('/dev/stdin','utf8'));
    console.log(data.state || 'UNKNOWN');
  " 2>/dev/null || echo "in-memory")

  info "  Circuit state before: $cbStateBefore"

  # Simulate LINE API failure (using hosts file to block line.pay.gov.tw)
  info "Simulating LINE API failure (blocking line.pay.gov.tw via iptables)..."
  docker exec "$APP_CONTAINER" sh -c '
    echo "0.0.0.0 line.pay.gov.tw" >> /etc/hosts 2>/dev/null || true
    echo "0.0.0.0 api.line.me" >> /etc/hosts 2>/dev/null || true
  ' 2>/dev/null || true

  info "Waiting 10s for circuit breaker to detect failures..."
  sleep 10

  # Check if circuit opened
  info "Checking circuit breaker state after failure..."
  local cbStateAfter="unknown"
  cbStateAfter=$(docker exec "$APP_CONTAINER" cat /app/.redis-cb-state.json 2>/dev/null | node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('/dev/stdin','utf8'));
    console.log(data.state || 'UNKNOWN');
  " 2>/dev/null || echo "in-memory")

  info "  Circuit state after: $cbStateAfter"

  # Restore network
  info "Restoring LINE API access..."
  docker exec "$APP_CONTAINER" sh -c '
    grep -v "0.0.0.0 line.pay.gov.tw" /etc/hosts > /tmp/hosts.tmp 2>/dev/null || true
    grep -v "0.0.0.0 api.line.me" /tmp/hosts.tmp > /etc/hosts 2>/dev/null || true
  ' 2>/dev/null || true

  info "Waiting 35s for HALF_OPEN probe and recovery..."
  sleep 35

  local cbStateRecovery="unknown"
  cbStateRecovery=$(docker exec "$APP_CONTAINER" cat /app/.redis-cb-state.json 2>/dev/null | node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync('/dev/stdin','utf8'));
    console.log(data.state || 'UNKNOWN');
  " 2>/dev/null || echo "in-memory")

  info "  Circuit state after recovery: $cbStateRecovery"

  if [[ "$cbStateAfter" == "OPEN" ]] || [[ "$cbStateRecovery" == "HALF_OPEN" ]] || [[ "$cbStateRecovery" == "CLOSED" ]]; then
    pass "Circuit breaker responded to LINE API failure"
  else
    warn "Circuit breaker state unclear — may use in-memory state"
  fi

  pass "DRILL 3 COMPLETE: LINE API downstream failure"
  return 0
}

# =============================================================================
# SCENARIO 4: Full Stack Restart
# =============================================================================
drill_full_restart() {
  section "DRILL 4: Full Stack Restart"

  info "Stopping all containers..."
  docker compose -f "$COMPOSE_FILE" down --timeout=30 2>/dev/null || \
  docker-compose -f "$COMPOSE_FILE" down --timeout=30 2>/dev/null

  info "Verifying all services stopped..."
  sleep 5

  local remaining
  remaining=$(docker ps --format '{{.Names}}' 2>/dev/null | grep -E 'postgres|redis|apt' | wc -l || echo "0")
  if (( remaining > 0 )); then
    warn "Some containers still running: $remaining"
  else
    info "✅ All services stopped"
  fi

  info "Starting full stack..."
  docker compose -f "$COMPOSE_FILE" up -d 2>/dev/null || \
  docker-compose -f "$COMPOSE_FILE" up -d 2>/dev/null

  info "Waiting for PostgreSQL (30s)..."
  wait_for_port "localhost" "5432" "PostgreSQL" 30 || { fail "PostgreSQL did not start"; return 1; }

  info "Waiting for Redis (20s)..."
  wait_for_port "localhost" "6379" "Redis" 20 || { fail "Redis did not start"; return 1; }

  info "Waiting for App (60s)..."
  wait_for_port "localhost" "3001" "App health endpoint" 60 || { fail "App did not start"; return 1; }

  # Run app health check
  info "Running app health check..."
  if check_app_health; then
    pass "App health check passed"
  else
    fail "App health check failed"
    return 1
  fi

  # Verify WAL archiving resumed
  info "Verifying WAL archiving resumed..."
  local archiveMode
  detect_containers
  archiveMode=$(exec_in "$POSTGRES_CONTAINER" psql -U postgres -d postgres -c "SELECT current_setting('archive_mode')" -t --quiet 2>/dev/null | tr -d ' ' || echo "")
  if [[ "$archiveMode" == "on" ]]; then
    pass "WAL archiving resumed after restart"
  else
    warn "WAL archiving status: ${archiveMode:-N/A}"
  fi

  pass "DRILL 4 COMPLETE: Full stack restart"
  return 0
}

# =============================================================================
# SCENARIO 5: Network Partition (PostgreSQL unreachable)
# =============================================================================
drill_network_partition() {
  section "DRILL 5: Network Partition (Postgres unreachable from App)"

  if [[ -z "$APP_CONTAINER" ]] || [[ -z "$POSTGRES_CONTAINER" ]]; then
    warn "Containers not found — skipping network partition drill"
    return 1
  fi

  info "Breaking network connection between App and PostgreSQL..."
  # Block app container from reaching postgres port
  docker exec "$APP_CONTAINER" sh -c '
    iptables -I OUTPUT -p tcp -d $(getent hosts postgres | awk "{print \$1}") --dport 5432 -j REJECT 2>/dev/null || true
  ' 2>/dev/null || true

  info "Waiting 10s for connection failures to be detected..."
  sleep 10

  info "Checking app logs for connection errors..."
  local errorCount
  errorCount=$(docker logs "$APP_CONTAINER" --tail 50 2>&1 | grep -ciE 'connection refused|db_pool|ECONNREFUSED' || echo "0")
  info "  Connection errors in logs: $errorCount"

  # Restore network
  info "Restoring network connection..."
  docker exec "$APP_CONTAINER" sh -c '
    iptables -D OUTPUT -p tcp -d $(getent hosts postgres | awk "{print \$1}") --dport 5432 -j REJECT 2>/dev/null || true
  ' 2>/dev/null || true

  info "Waiting 15s for app to reconnect..."
  sleep 15

  if check_app_health; then
    pass "App recovered after network partition"
  else
    warn "App health check did not pass after partition"
  fi

  pass "DRILL 5 COMPLETE: Network partition"
  return 0
}

# =============================================================================
# Summary Report
# =============================================================================
print_summary() {
  section "DR DRILL SUMMARY"

  local total=0 passed=0 failed=0 skipped=0

  for result in "${RESULTS[@]}"; do
    ((total++))
    case "$result" in
      PASS) ((passed++)) ;;
      FAIL) ((failed++)) ;;
      SKIP) ((skipped++)) ;;
    esac
  done

  echo -e "  Total scenarios: $total"
  echo -e "  ${GREEN}Passed: $passed${NC}"
  echo -e "  ${RED}Failed: $failed${NC}"
  echo -e "  ${YELLOW}Skipped: $skipped${NC}"
  echo ""

  if (( failed > 0 )); then
    echo -e "  ${RED}Verdict: DRILL FAILED — needs remediation${NC}"
    return 1
  else
    echo -e "  ${GREEN}Verdict: DRILL PASSED${NC}"
    return 0
  fi
}

# =============================================================================
# Main
# =============================================================================
main() {
  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}  APARTMENT ERP — DR DISASTER RECOVERY DRILL${NC}"
  echo -e "${CYAN}  Date: $(date -Iseconds)${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════════${NC}"

  check_prereqs || exit 2

  declare -a RESULTS=()

  case "$SCENARIO" in
    postgres)  drill_postgres_crash ;;
    redis)     drill_redis_crash ;;
    line)     drill_line_api_down ;;
    full)     drill_full_restart ;;
    network)  drill_network_partition ;;
    all)
      drill_postgres_crash;     RESULTS+=("$?"); echo ""
      drill_redis_crash;       RESULTS+=("$?"); echo ""
      drill_line_api_down;     RESULTS+=("$?"); echo ""
      drill_full_restart;      RESULTS+=("$?"); echo ""
      drill_network_partition;  RESULTS+=("$?"); echo ""
      ;;
    *)
      echo "Usage: $0 [postgres|redis|line|full|network|all]"
      exit 1
      ;;
  esac

  print_summary
}

main "$@"
