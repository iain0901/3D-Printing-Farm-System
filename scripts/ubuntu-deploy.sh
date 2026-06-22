#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT_DIR"

ENV_FILE="${LAYERPILOT_ENV_FILE:-.env}"
DEPLOY_LOCK_DIR="${LAYERPILOT_DEPLOY_LOCK_DIR:-/tmp/layerpilot-deploy.lock}"

usage() {
  cat <<'EOF'
Usage:
  scripts/ubuntu-deploy.sh init-env
  scripts/ubuntu-deploy.sh doctor
  scripts/ubuntu-deploy.sh deploy
  scripts/ubuntu-deploy.sh update
  scripts/ubuntu-deploy.sh rollback [backup-archive.tgz]
  scripts/ubuntu-deploy.sh ops-check
  scripts/ubuntu-deploy.sh support-bundle
  scripts/ubuntu-deploy.sh smoke
  scripts/ubuntu-deploy.sh logs
  scripts/ubuntu-deploy.sh status

First deploy example:
  LAYERPILOT_ADMIN_EMAIL=owner@example.com \
  LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
  LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
  scripts/ubuntu-deploy.sh deploy
EOF
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    return 1
  fi
}

compose() {
  docker compose "$@"
}

app_url() {
  printf "%s" "${LAYERPILOT_PUBLIC_URL:-http://127.0.0.1:8797}"
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 36 | tr -d '\n'
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
  fi
}

env_quote() {
  local value="${1:-}"
  case "$value" in
    *$'\n'*|*$'\r'*)
      echo "Environment values must not contain newlines." >&2
      return 1
      ;;
  esac
  printf "'"
  printf "%s" "$value" | sed "s/'/'\\\\''/g"
  printf "'"
}

write_env_line() {
  local key="$1"
  local value="${2:-}"
  local quoted
  quoted="$(env_quote "$value")" || return 1
  printf "%s=%s\n" "$key" "$quoted"
}

check_docker() {
  need_command docker
  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose plugin is unavailable. Run: bash scripts/ubuntu-setup.sh install-deps" >&2
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker daemon is not reachable by the current user." >&2
    echo "If you just ran install-deps, run: newgrp docker, or reconnect to refresh group membership." >&2
    echo "Otherwise check Docker with: sudo systemctl status docker" >&2
    return 1
  fi
}

validate_deploy_lock_dir() {
  case "$DEPLOY_LOCK_DIR" in
    ""|"/"|"/."|"."|"..")
      echo "LAYERPILOT_DEPLOY_LOCK_DIR is unsafe: $DEPLOY_LOCK_DIR" >&2
      return 1
      ;;
  esac
  case "$DEPLOY_LOCK_DIR" in
    *$'\n'*|*$'\r'*)
      echo "LAYERPILOT_DEPLOY_LOCK_DIR must not contain newlines." >&2
      return 1
      ;;
  esac
}

release_deploy_lock() {
  if [ -n "${DEPLOY_LOCK_HELD:-}" ] && [ -d "$DEPLOY_LOCK_DIR" ]; then
    rm -rf "$DEPLOY_LOCK_DIR"
  fi
}

acquire_deploy_lock() {
  validate_deploy_lock_dir
  mkdir -p "$(dirname "$DEPLOY_LOCK_DIR")"
  if mkdir "$DEPLOY_LOCK_DIR" 2>/dev/null; then
    DEPLOY_LOCK_HELD=1
    printf "%s\n" "$$" > "$DEPLOY_LOCK_DIR/pid"
    trap release_deploy_lock EXIT
    return 0
  fi
  local owner="unknown"
  if [ -f "$DEPLOY_LOCK_DIR/pid" ]; then
    owner="$(cat "$DEPLOY_LOCK_DIR/pid" 2>/dev/null || printf "unknown")"
  fi
  echo "Another LayerPilot deploy/update/rollback appears to be running (lock: $DEPLOY_LOCK_DIR, pid: $owner)." >&2
  echo "If no such process exists, remove the lock directory manually and retry." >&2
  return 1
}

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

fail_if_default_secret() {
  local name="$1"
  local value="${2:-}"
  local default_value="$3"
  if [ "$value" = "$default_value" ]; then
    echo "$name is still set to the example default." >&2
    return 1
  fi
}

check_env_file_permissions() {
  if command -v stat >/dev/null 2>&1; then
    local mode
    mode="$(stat -c "%a" "$ENV_FILE" 2>/dev/null || true)"
    if [ -n "$mode" ] && [ $((10#$mode % 100)) -ne 0 ]; then
      echo "$ENV_FILE is readable or writable by group/other. Run: chmod 600 $ENV_FILE" >&2
      return 1
    fi
  fi
}

check_boolean_env() {
  local name="$1"
  local value="${2:-}"
  case "$value" in
    true|false) ;;
    *)
      echo "$name must be true or false." >&2
      return 1
      ;;
  esac
}

check_number_env() {
  local name="$1"
  local value="${2:-}"
  case "$value" in
    ''|*[!0-9]*)
      echo "$name must be a non-negative whole number." >&2
      return 1
      ;;
  esac
}

check_optional_url_env() {
  local name="$1"
  local value="${2:-}"
  if [ -n "$value" ] && ! printf "%s" "$value" | grep -Eq '^https?://'; then
    echo "$name must start with http:// or https:// when set." >&2
    return 1
  fi
}

check_optional_mqtt_url_env() {
  local name="$1"
  local value="${2:-}"
  if [ -n "$value" ] && ! printf "%s" "$value" | grep -Eq '^mqtts?://'; then
    echo "$name must start with mqtt:// or mqtts:// when set." >&2
    return 1
  fi
}

check_integration_env() {
  case "${LAYERPILOT_DB_ADAPTER:-json}" in
    json|sqlite) ;;
    *)
      echo "LAYERPILOT_DB_ADAPTER must be json or sqlite." >&2
      return 1
      ;;
  esac
  case "${LAYERPILOT_OBJECT_STORAGE_PROVIDER:-local}" in
    local|s3) ;;
    *)
      echo "LAYERPILOT_OBJECT_STORAGE_PROVIDER must be local or s3." >&2
      return 1
      ;;
  esac
  if [ "${LAYERPILOT_OBJECT_STORAGE_PROVIDER:-local}" = "s3" ]; then
    : "${LAYERPILOT_S3_BUCKET:?Missing LAYERPILOT_S3_BUCKET for S3 storage}"
    : "${LAYERPILOT_S3_REGION:?Missing LAYERPILOT_S3_REGION for S3 storage}"
    : "${LAYERPILOT_S3_ACCESS_KEY_ID:?Missing LAYERPILOT_S3_ACCESS_KEY_ID for S3 storage}"
    : "${LAYERPILOT_S3_SECRET_ACCESS_KEY:?Missing LAYERPILOT_S3_SECRET_ACCESS_KEY for S3 storage}"
  fi
  if [ -n "${LAYERPILOT_STRIPE_SECRET_KEY:-}" ] || [ -n "${LAYERPILOT_STRIPE_WEBHOOK_SECRET:-}" ]; then
    : "${LAYERPILOT_STRIPE_SECRET_KEY:?Missing LAYERPILOT_STRIPE_SECRET_KEY for Stripe billing}"
    : "${LAYERPILOT_STRIPE_WEBHOOK_SECRET:?Missing LAYERPILOT_STRIPE_WEBHOOK_SECRET for Stripe billing}"
    : "${LAYERPILOT_STRIPE_PRICE_STUDIO:?Missing LAYERPILOT_STRIPE_PRICE_STUDIO for Stripe billing}"
    : "${LAYERPILOT_STRIPE_PRICE_FARM:?Missing LAYERPILOT_STRIPE_PRICE_FARM for Stripe billing}"
    : "${LAYERPILOT_STRIPE_PRICE_ENTERPRISE:?Missing LAYERPILOT_STRIPE_PRICE_ENTERPRISE for Stripe billing}"
  fi
  if [ -n "${LAYERPILOT_MQTT_URL:-}" ]; then
    check_optional_mqtt_url_env "LAYERPILOT_MQTT_URL" "$LAYERPILOT_MQTT_URL"
    check_number_env "LAYERPILOT_MQTT_QOS" "${LAYERPILOT_MQTT_QOS:-0}"
    case "${LAYERPILOT_MQTT_QOS:-0}" in
      0|1|2) ;;
      *)
        echo "LAYERPILOT_MQTT_QOS must be 0, 1, or 2." >&2
        return 1
        ;;
    esac
    check_boolean_env "LAYERPILOT_MQTT_RETAIN" "${LAYERPILOT_MQTT_RETAIN:-false}"
  fi
}

doctor() {
  check_docker
  need_command curl
  [ -f Dockerfile ] || {
    echo "Dockerfile is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f docker-compose.yml ] || {
    echo "docker-compose.yml is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f scripts/ubuntu-backup.sh ] || {
    echo "scripts/ubuntu-backup.sh is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f scripts/ubuntu-ops-check.sh ] || {
    echo "scripts/ubuntu-ops-check.sh is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f scripts/ubuntu-setup.sh ] || {
    echo "scripts/ubuntu-setup.sh is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f scripts/ubuntu-go-live-check.sh ] || {
    echo "scripts/ubuntu-go-live-check.sh is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f scripts/ubuntu-package.sh ] || {
    echo "scripts/ubuntu-package.sh is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f scripts/ubuntu-support-bundle.sh ] || {
    echo "scripts/ubuntu-support-bundle.sh is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f deploy/ubuntu/nginx.layerpilot.conf ] || {
    echo "deploy/ubuntu/nginx.layerpilot.conf is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f deploy/ubuntu/docker-daemon.json ] || {
    echo "deploy/ubuntu/docker-daemon.json is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f deploy/ubuntu/layerpilot-ops-check.service ] || {
    echo "deploy/ubuntu/layerpilot-ops-check.service is missing from $ROOT_DIR." >&2
    return 1
  }
  [ -f deploy/ubuntu/layerpilot-ops-check.timer ] || {
    echo "deploy/ubuntu/layerpilot-ops-check.timer is missing from $ROOT_DIR." >&2
    return 1
  }
  if [ ! -f "$ENV_FILE" ]; then
    echo "$ENV_FILE does not exist. Run scripts/ubuntu-deploy.sh init-env first." >&2
    return 1
  fi
  check_env_file_permissions
  load_env
  : "${LAYERPILOT_ADMIN_EMAIL:?Missing LAYERPILOT_ADMIN_EMAIL in $ENV_FILE}"
  : "${LAYERPILOT_ADMIN_PASSWORD:?Missing LAYERPILOT_ADMIN_PASSWORD in $ENV_FILE}"
  : "${LAYERPILOT_WORKER_TOKEN:?Missing LAYERPILOT_WORKER_TOKEN in $ENV_FILE}"
  : "${LAYERPILOT_METRICS_TOKEN:?Missing LAYERPILOT_METRICS_TOKEN in $ENV_FILE}"
  fail_if_default_secret "LAYERPILOT_ADMIN_PASSWORD" "$LAYERPILOT_ADMIN_PASSWORD" "change-this-password"
  fail_if_default_secret "LAYERPILOT_WORKER_TOKEN" "$LAYERPILOT_WORKER_TOKEN" "change-this-worker-token"
  fail_if_default_secret "LAYERPILOT_METRICS_TOKEN" "$LAYERPILOT_METRICS_TOKEN" "change-this-metrics-token"
  if [ "${#LAYERPILOT_ADMIN_PASSWORD}" -lt 14 ]; then
    echo "LAYERPILOT_ADMIN_PASSWORD should be at least 14 characters for production." >&2
    return 1
  fi
  if [ "${#LAYERPILOT_WORKER_TOKEN}" -lt 32 ] || [ "${#LAYERPILOT_METRICS_TOKEN}" -lt 32 ]; then
    echo "Worker and metrics tokens should be at least 32 characters." >&2
    return 1
  fi
  if [ "${LAYERPILOT_DISABLE_DEFAULT_USERS:-}" != "true" ]; then
    echo "LAYERPILOT_DISABLE_DEFAULT_USERS should be true for production." >&2
    return 1
  fi
  if [ "${LAYERPILOT_DISABLE_DEMO_LOGIN:-}" != "true" ]; then
    echo "LAYERPILOT_DISABLE_DEMO_LOGIN should be true for production." >&2
    return 1
  fi
  if [ "${LAYERPILOT_BIND_ADDRESS:-127.0.0.1}" = "0.0.0.0" ]; then
    echo "Warning: LAYERPILOT_BIND_ADDRESS=0.0.0.0 exposes port 8797 directly. Prefer 127.0.0.1 behind Nginx." >&2
  fi
  check_number_env "LAYERPILOT_BACKUP_RETENTION_DAYS" "${LAYERPILOT_BACKUP_RETENTION_DAYS:-30}"
  check_boolean_env "LAYERPILOT_AUTO_BACKUP_ON_MIGRATE" "${LAYERPILOT_AUTO_BACKUP_ON_MIGRATE:-true}"
  check_boolean_env "LAYERPILOT_PRE_RESTORE_BACKUP" "${LAYERPILOT_PRE_RESTORE_BACKUP:-true}"
  check_boolean_env "LAYERPILOT_WORKER_TELEMETRY" "${LAYERPILOT_WORKER_TELEMETRY:-true}"
  check_boolean_env "LAYERPILOT_WORKER_BRIDGE_POLLING" "${LAYERPILOT_WORKER_BRIDGE_POLLING:-true}"
  check_number_env "LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS" "${LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS:-5000}"
  check_number_env "LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS" "${LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS:-10000}"
  check_optional_url_env "LAYERPILOT_PUBLIC_URL" "${LAYERPILOT_PUBLIC_URL:-}"
  check_optional_url_env "LAYERPILOT_BILLING_PORTAL_URL" "${LAYERPILOT_BILLING_PORTAL_URL:-}"
  check_integration_env
  docker compose config >/dev/null
  echo "Doctor checks passed."
}

write_env() {
  if [ -f "$ENV_FILE" ]; then
    echo "$ENV_FILE already exists; leaving it unchanged."
    return 0
  fi
  : "${LAYERPILOT_ADMIN_EMAIL:?Set LAYERPILOT_ADMIN_EMAIL before creating .env}"
  : "${LAYERPILOT_ADMIN_PASSWORD:?Set LAYERPILOT_ADMIN_PASSWORD before creating .env}"
  umask 077
  local metrics_token worker_token
  metrics_token="${LAYERPILOT_METRICS_TOKEN:-$(random_secret)}"
  worker_token="${LAYERPILOT_WORKER_TOKEN:-$(random_secret)}"
  {
    write_env_line "LAYERPILOT_ADMIN_EMAIL" "$LAYERPILOT_ADMIN_EMAIL"
    write_env_line "LAYERPILOT_ADMIN_PASSWORD" "$LAYERPILOT_ADMIN_PASSWORD"
    write_env_line "LAYERPILOT_ADMIN_NAME" "${LAYERPILOT_ADMIN_NAME:-Production Owner}"
    write_env_line "LAYERPILOT_WORKSPACE_NAME" "${LAYERPILOT_WORKSPACE_NAME:-LayerPilot Production}"
    write_env_line "LAYERPILOT_PUBLIC_URL" "${LAYERPILOT_PUBLIC_URL:-http://127.0.0.1:8797}"
    write_env_line "LAYERPILOT_BIND_ADDRESS" "${LAYERPILOT_BIND_ADDRESS:-127.0.0.1}"
    write_env_line "LAYERPILOT_DISABLE_DEFAULT_USERS" "true"
    write_env_line "LAYERPILOT_DISABLE_DEMO_LOGIN" "true"
    write_env_line "LAYERPILOT_METRICS_TOKEN" "$metrics_token"
    write_env_line "LAYERPILOT_AUTO_BACKUP_ON_MIGRATE" "true"
    write_env_line "LAYERPILOT_DB_ADAPTER" "${LAYERPILOT_DB_ADAPTER:-json}"
    write_env_line "LAYERPILOT_BACKUP_RETENTION_DAYS" "${LAYERPILOT_BACKUP_RETENTION_DAYS:-30}"
    write_env_line "LAYERPILOT_PRE_RESTORE_BACKUP" "true"
    write_env_line "LAYERPILOT_DEPLOY_LOCK_DIR" "${LAYERPILOT_DEPLOY_LOCK_DIR:-/tmp/layerpilot-deploy.lock}"
    write_env_line "LAYERPILOT_WORKER_ID" "${LAYERPILOT_WORKER_ID:-layerpilot-worker}"
    write_env_line "LAYERPILOT_WORKER_TELEMETRY" "true"
    write_env_line "LAYERPILOT_WORKER_BRIDGE_POLLING" "true"
    write_env_line "LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS" "5000"
    write_env_line "LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS" "10000"
    write_env_line "LAYERPILOT_WORKER_TOKEN" "$worker_token"
    write_env_line "LAYERPILOT_OBJECT_STORAGE_PROVIDER" "${LAYERPILOT_OBJECT_STORAGE_PROVIDER:-local}"
    write_env_line "LAYERPILOT_S3_BUCKET" "${LAYERPILOT_S3_BUCKET:-}"
    write_env_line "LAYERPILOT_S3_REGION" "${LAYERPILOT_S3_REGION:-us-east-1}"
    write_env_line "LAYERPILOT_S3_ENDPOINT" "${LAYERPILOT_S3_ENDPOINT:-}"
    write_env_line "LAYERPILOT_S3_PREFIX" "${LAYERPILOT_S3_PREFIX:-layerpilot}"
    write_env_line "LAYERPILOT_S3_FORCE_PATH_STYLE" "${LAYERPILOT_S3_FORCE_PATH_STYLE:-false}"
    write_env_line "LAYERPILOT_S3_ACCESS_KEY_ID" "${LAYERPILOT_S3_ACCESS_KEY_ID:-}"
    write_env_line "LAYERPILOT_S3_SECRET_ACCESS_KEY" "${LAYERPILOT_S3_SECRET_ACCESS_KEY:-}"
    write_env_line "LAYERPILOT_BILLING_PORTAL_URL" "${LAYERPILOT_BILLING_PORTAL_URL:-}"
    write_env_line "LAYERPILOT_STRIPE_SECRET_KEY" "${LAYERPILOT_STRIPE_SECRET_KEY:-}"
    write_env_line "LAYERPILOT_STRIPE_WEBHOOK_SECRET" "${LAYERPILOT_STRIPE_WEBHOOK_SECRET:-}"
    write_env_line "LAYERPILOT_STRIPE_PRICE_STUDIO" "${LAYERPILOT_STRIPE_PRICE_STUDIO:-}"
    write_env_line "LAYERPILOT_STRIPE_PRICE_FARM" "${LAYERPILOT_STRIPE_PRICE_FARM:-}"
    write_env_line "LAYERPILOT_STRIPE_PRICE_ENTERPRISE" "${LAYERPILOT_STRIPE_PRICE_ENTERPRISE:-}"
    write_env_line "LAYERPILOT_MQTT_URL" "${LAYERPILOT_MQTT_URL:-}"
    write_env_line "LAYERPILOT_MQTT_TOPIC_PREFIX" "${LAYERPILOT_MQTT_TOPIC_PREFIX:-layerpilot}"
    write_env_line "LAYERPILOT_MQTT_USERNAME" "${LAYERPILOT_MQTT_USERNAME:-}"
    write_env_line "LAYERPILOT_MQTT_PASSWORD" "${LAYERPILOT_MQTT_PASSWORD:-}"
    write_env_line "LAYERPILOT_MQTT_QOS" "${LAYERPILOT_MQTT_QOS:-0}"
    write_env_line "LAYERPILOT_MQTT_RETAIN" "${LAYERPILOT_MQTT_RETAIN:-false}"
    write_env_line "LAYERPILOT_SLICER_CMD" "${LAYERPILOT_SLICER_CMD:-}"
    write_env_line "LAYERPILOT_SLICER_ARGS" "${LAYERPILOT_SLICER_ARGS:-}"
  } > "$ENV_FILE"
  echo "Created $ENV_FILE with 600-style permissions. Keep it private."
}

wait_ready() {
  local base_url
  base_url="$(app_url)"
  local url="${base_url%/}/api/readiness"
  echo "Waiting for $url ..."
  for _ in $(seq 1 60); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "LayerPilot is ready."
      return 0
    fi
    sleep 2
  done
  echo "LayerPilot did not become ready in time." >&2
  compose ps
  return 1
}

run_smoke() {
  check_docker
  load_env
  local base_url
  base_url="$(app_url)"
  if command -v npm >/dev/null 2>&1 && [ -f package.json ]; then
    LAYERPILOT_SMOKE_URL="$base_url" \
    LAYERPILOT_SMOKE_EMAIL="${LAYERPILOT_SMOKE_EMAIL:-${LAYERPILOT_ADMIN_EMAIL:-}}" \
    LAYERPILOT_SMOKE_PASSWORD="${LAYERPILOT_SMOKE_PASSWORD:-${LAYERPILOT_ADMIN_PASSWORD:-}}" \
    LAYERPILOT_SMOKE_METRICS_TOKEN="${LAYERPILOT_SMOKE_METRICS_TOKEN:-${LAYERPILOT_METRICS_TOKEN:-}}" \
    npm run smoke:prod
    return 0
  fi
  echo "npm is not installed; running curl-only smoke checks."
  curl -fsS "${base_url%/}/api/health" >/dev/null
  curl -fsS "${base_url%/}/api/readiness" >/dev/null
  curl -fsS "${base_url%/}/" | grep -Eq 'LayerPilot|id="root"'
  echo "curl smoke checks passed for ${base_url}."
}

deploy() {
  check_docker
  if [ ! -f "$ENV_FILE" ]; then
    write_env
  fi
  doctor
  compose up --build -d
  wait_ready
  run_smoke
}

update_deploy() {
  doctor
  if command -v git >/dev/null 2>&1 && [ -d .git ]; then
    git pull --ff-only
  else
    echo "Skipping git pull; git is unavailable or this is not a git checkout."
  fi
  if command -v npm >/dev/null 2>&1 && [ -f package-lock.json ]; then
    npm ci
    npm run qc
  else
    echo "Skipping local npm QC; npm or package-lock.json is unavailable."
  fi
  bash scripts/ubuntu-backup.sh backup
  deploy
}

latest_backup() {
  local backup_dir="${LAYERPILOT_BACKUP_DIR:-$HOME/layerpilot-backups}"
  find "$backup_dir" -maxdepth 1 -type f -name 'layerpilot-data-*.tgz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1{s/^[^ ]* //;p;}'
}

rollback_deploy() {
  check_docker
  load_env
  local archive="${1:-}"
  if [ -z "$archive" ]; then
    archive="$(latest_backup)"
  fi
  if [ -z "$archive" ] || [ ! -f "$archive" ]; then
    echo "Rollback requires an existing backup archive, or at least one layerpilot-data-*.tgz in the backup directory." >&2
    return 2
  fi
  echo "Rolling back LayerPilot data volume from: $archive"
  bash scripts/ubuntu-backup.sh verify "$archive"
  bash scripts/ubuntu-backup.sh restore "$archive"
  wait_ready
  run_smoke
  bash scripts/ubuntu-deploy.sh ops-check
  echo "Rollback completed from: $archive"
}

case "${1:-deploy}" in
  init-env)
    write_env
    ;;
  doctor)
    doctor
    ;;
  deploy)
    acquire_deploy_lock
    deploy
    ;;
  update)
    acquire_deploy_lock
    update_deploy
    ;;
  rollback)
    acquire_deploy_lock
    rollback_deploy "${2:-}"
    ;;
  ops-check)
    bash scripts/ubuntu-ops-check.sh
    ;;
  support-bundle)
    bash scripts/ubuntu-support-bundle.sh
    ;;
  smoke)
    run_smoke
    ;;
  logs)
    check_docker
    compose logs -f --tail=200
    ;;
  status)
    check_docker
    load_env
    base_url="$(app_url)"
    compose ps
    curl -fsS "${base_url%/}/api/readiness"
    echo
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
