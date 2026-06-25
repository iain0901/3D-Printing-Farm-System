#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT_DIR"

ENV_FILE="${LAYERPILOT_ENV_FILE:-.env}"
BACKUP_DIR="${LAYERPILOT_BACKUP_DIR:-$HOME/layerpilot-backups}"
MIN_FREE_MB="${LAYERPILOT_MIN_FREE_MB:-2048}"
WARNINGS=0
FAILURES=0

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

app_url() {
  printf "%s" "${LAYERPILOT_PUBLIC_URL:-http://127.0.0.1:8797}"
}

ok() {
  echo "ok: $1"
}

warn() {
  WARNINGS=$((WARNINGS + 1))
  echo "warn: $1" >&2
}

fail() {
  FAILURES=$((FAILURES + 1))
  echo "fail: $1" >&2
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing command: $1"
    return 1
  fi
  ok "$1 is installed"
}

check_url() {
  local url="$1"
  local label="$2"
  if curl -fsS "$url" >/dev/null; then
    ok "$label reachable at $url"
  else
    fail "$label unreachable at $url"
  fi
}

check_numeric_env() {
  local name="$1"
  local value="$2"
  case "$value" in
    ''|*[!0-9]*)
      fail "$name must be a non-negative whole number"
      return 1
      ;;
  esac
}

check_compose() {
  need_command docker || return 0
  if docker compose version >/dev/null; then
    ok "docker compose is available"
  else
    fail "docker compose is unavailable"
    return 0
  fi
  docker compose ps
  local running
  running="$(docker compose ps --services --filter status=running 2>/dev/null || true)"
  echo "$running" | grep -qx "layerpilot" && ok "layerpilot service is running" || fail "layerpilot service is not running"
  echo "$running" | grep -qx "layerpilot-worker" && ok "layerpilot-worker service is running" || warn "layerpilot-worker service is not running"
}

check_app() {
  need_command curl || return 0
  local base_url
  base_url="$(app_url)"
  check_url "${base_url%/}/api/health" "API health"
  check_url "${base_url%/}/api/readiness" "API readiness"
  check_url "${base_url%/}/" "frontend"
}

check_authenticated_api() {
  local email="${LAYERPILOT_OPS_EMAIL:-${LAYERPILOT_SMOKE_EMAIL:-${LAYERPILOT_ADMIN_EMAIL:-}}}"
  local password="${LAYERPILOT_OPS_PASSWORD:-${LAYERPILOT_SMOKE_PASSWORD:-${LAYERPILOT_ADMIN_PASSWORD:-}}}"
  if [ -z "$email" ] || [ -z "$password" ]; then
    warn "authenticated API checks skipped; set LAYERPILOT_OPS_EMAIL/LAYERPILOT_OPS_PASSWORD or admin credentials in $ENV_FILE"
    return 0
  fi
  local base_url
  base_url="$(app_url)"
  if command -v node >/dev/null 2>&1; then
    if LAYERPILOT_OPS_URL="$base_url" \
      LAYERPILOT_OPS_EMAIL="$email" \
      LAYERPILOT_OPS_PASSWORD="$password" \
      LAYERPILOT_OPS_METRICS_TOKEN="${LAYERPILOT_OPS_METRICS_TOKEN:-${LAYERPILOT_SMOKE_METRICS_TOKEN:-${LAYERPILOT_METRICS_TOKEN:-}}}" \
      node scripts/ops-auth-check.mjs; then
      ok "authenticated API, audit, and metrics checks passed"
    else
      fail "authenticated API, audit, or metrics check failed"
    fi
    return 0
  fi
  if command -v docker >/dev/null 2>&1 && [ -f scripts/ops-auth-check.mjs ]; then
    if docker compose exec -T -e LAYERPILOT_OPS_URL="$base_url" layerpilot node --input-type=module - < scripts/ops-auth-check.mjs; then
      ok "authenticated API, audit, and metrics checks passed in layerpilot container"
    else
      fail "authenticated API, audit, or metrics check failed in layerpilot container"
    fi
    return 0
  fi
  warn "authenticated API checks skipped; node is unavailable and the layerpilot container could not run the checker"
}

check_backups() {
  mkdir -p "$BACKUP_DIR"
  check_numeric_env "LAYERPILOT_MIN_FREE_MB" "$MIN_FREE_MB" || return 0
  local latest
  latest="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'layerpilot-data-*.tgz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1{s/^[^ ]* //;p;}')"
  if [ -n "$latest" ]; then
    ok "latest backup: $latest"
  else
    warn "no layerpilot-data backup archives found in $BACKUP_DIR"
  fi
  local free_mb
  free_mb="$(df -Pm "$BACKUP_DIR" | awk 'NR==2 {print $4}')"
  if [ -n "$free_mb" ] && [ "$free_mb" -ge "$MIN_FREE_MB" ]; then
    ok "backup filesystem has ${free_mb}MB free"
  else
    fail "backup filesystem has ${free_mb:-unknown}MB free; expected at least ${MIN_FREE_MB}MB"
  fi
}

check_systemd_timer() {
  if ! command -v systemctl >/dev/null 2>&1; then
    warn "systemctl is unavailable; skipping layerpilot-backup.timer check"
    return 0
  fi
  if systemctl is-enabled --quiet layerpilot-backup.timer; then
    ok "layerpilot-backup.timer is enabled"
  else
    warn "layerpilot-backup.timer is not enabled"
  fi
  if systemctl is-active --quiet layerpilot-backup.timer; then
    ok "layerpilot-backup.timer is active"
  else
    warn "layerpilot-backup.timer is not active"
  fi
  systemctl list-timers layerpilot-backup.timer --no-pager || true
}

check_docker_logs() {
  if [ -f /etc/docker/daemon.json ] && grep -q '"max-size"' /etc/docker/daemon.json && grep -q '"max-file"' /etc/docker/daemon.json; then
    ok "Docker log rotation appears configured in /etc/docker/daemon.json"
  else
    warn "Docker log rotation not detected; see deploy/ubuntu/docker-daemon.json"
  fi
}

load_env
BACKUP_DIR="${LAYERPILOT_BACKUP_DIR:-$BACKUP_DIR}"
MIN_FREE_MB="${LAYERPILOT_MIN_FREE_MB:-$MIN_FREE_MB}"

check_compose
check_app
check_authenticated_api
check_backups
check_systemd_timer
check_docker_logs

if [ "$FAILURES" -gt 0 ]; then
  echo "3DSTU FarmFlow ops check failed with $FAILURES failure(s) and $WARNINGS warning(s)." >&2
  exit 1
fi

echo "3DSTU FarmFlow ops check passed with $WARNINGS warning(s)."
