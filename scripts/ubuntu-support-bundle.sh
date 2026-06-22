#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT_DIR"

ENV_FILE="${LAYERPILOT_ENV_FILE:-.env}"
SUPPORT_DIR="${LAYERPILOT_SUPPORT_DIR:-/tmp/layerpilot-support}"
BACKUP_DIR="${LAYERPILOT_BACKUP_DIR:-$HOME/layerpilot-backups}"

usage() {
  cat <<'EOF'
Usage:
  scripts/ubuntu-support-bundle.sh

Environment:
  LAYERPILOT_DIR          Project root, default parent of this script
  LAYERPILOT_ENV_FILE     Environment file to summarize, default .env
  LAYERPILOT_SUPPORT_DIR  Directory for generated support bundles, default /tmp/layerpilot-support

The bundle is intended for Ubuntu deployment troubleshooting. It redacts environment
values whose key names look secret, but review the archive before sharing it outside
your organization.
EOF
}

redact_stream() {
  sed -E \
    -e 's/([A-Za-z0-9_]*(PASSWORD|SECRET|TOKEN|PRIVATE|CREDENTIAL|ACCESS_KEY|API_KEY)[A-Za-z0-9_]*=)[^[:space:]]+/\1REDACTED/Ig' \
    -e 's/("(password|secret|token|private|credential|accessKey|apiKey)"[[:space:]]*:[[:space:]]*")[^"]+/\1REDACTED/Ig'
}

run_capture() {
  local target="$1"
  shift
  {
    printf '$'
    printf ' %q' "$@"
    printf '\n\n'
    "$@" 2>&1 || true
  } | redact_stream > "$target"
}

write_env_summary() {
  local target="$1"
  if [ ! -f "$ENV_FILE" ]; then
    echo "$ENV_FILE not found." > "$target"
    return 0
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*)
        printf '%s\n' "$line"
        ;;
      *=*)
        local key="${line%%=*}"
        local value="${line#*=}"
        case "$key" in
          *PASSWORD*|*SECRET*|*TOKEN*|*PRIVATE*|*CREDENTIAL*|*ACCESS_KEY*|*API_KEY*)
            printf '%s=REDACTED\n' "$key"
            ;;
          *)
            printf '%s=%s\n' "$key" "$value"
            ;;
        esac
        ;;
      *)
        printf '%s\n' "$line"
        ;;
    esac
  done < "$ENV_FILE" > "$target"
}

latest_backup() {
  local backup_dir="${LAYERPILOT_BACKUP_DIR:-$BACKUP_DIR}"
  find "$backup_dir" -maxdepth 1 -type f -name 'layerpilot-data-*.tgz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1{s/^[^ ]* //;p;}'
}

app_url() {
  printf "%s" "${LAYERPILOT_PUBLIC_URL:-http://127.0.0.1:8797}"
}

case "${1:-run}" in
  -h|--help|help)
    usage
    exit 0
    ;;
  run)
    ;;
  *)
    usage
    exit 2
    ;;
esac

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

mkdir -p "$SUPPORT_DIR"
stamp="$(date +%Y%m%d-%H%M%S)"
base_url="$(app_url)"
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/layerpilot-support-$stamp.XXXXXX")"
cleanup() {
  rm -rf "$work_dir"
}
trap cleanup EXIT

{
  echo "LayerPilot support bundle"
  echo "Generated: $(date -Is)"
  echo "Project root: $ROOT_DIR"
  echo "Environment file: $ENV_FILE"
  echo "Public URL: $base_url"
} > "$work_dir/summary.txt"

write_env_summary "$work_dir/env.redacted"

if [ -f /etc/os-release ]; then
  cp /etc/os-release "$work_dir/os-release"
fi

run_capture "$work_dir/uname.txt" uname -a
run_capture "$work_dir/disk.txt" df -h
run_capture "$work_dir/docker-version.txt" docker version
run_capture "$work_dir/docker-compose-version.txt" docker compose version
run_capture "$work_dir/docker-compose-ps.txt" docker compose ps
run_capture "$work_dir/docker-compose-logs.txt" docker compose logs --tail=200 layerpilot layerpilot-worker
run_capture "$work_dir/health.txt" curl -fsS "${base_url%/}/api/health"
run_capture "$work_dir/readiness.txt" curl -fsS "${base_url%/}/api/readiness"
run_capture "$work_dir/backup-list.txt" find "${LAYERPILOT_BACKUP_DIR:-$BACKUP_DIR}" -maxdepth 1 -type f -name '*.tgz' -printf '%TY-%Tm-%Td %TH:%TM %s %p\n'
run_capture "$work_dir/systemd-backup-timer.txt" systemctl status layerpilot-backup.timer --no-pager
run_capture "$work_dir/systemd-ops-timer.txt" systemctl status layerpilot-ops-check.timer --no-pager

archive="$(latest_backup)"
if [ -n "$archive" ]; then
  printf '%s\n' "$archive" > "$work_dir/latest-backup.txt"
fi

bundle="$SUPPORT_DIR/layerpilot-support-$stamp.tgz"
tar czf "$bundle" -C "$work_dir" .
echo "Support bundle written: $bundle"
