#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT_DIR"

ENV_FILE="${LAYERPILOT_ENV_FILE:-.env}"

load_env() {
  if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
  fi
}

load_env

RUN_DEPLOY="${LAYERPILOT_GO_LIVE_DEPLOY:-false}"
RUN_LOCAL_QC="${LAYERPILOT_GO_LIVE_QC:-true}"
SUPPORT_ON_FAILURE="${LAYERPILOT_GO_LIVE_SUPPORT_ON_FAILURE:-true}"
REPORT_PATH="${LAYERPILOT_GO_LIVE_REPORT:-}"
REPORT_DIR="${LAYERPILOT_GO_LIVE_REPORT_DIR:-release}"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

usage() {
  cat <<'EOF'
Usage:
  scripts/ubuntu-go-live-check.sh

Environment:
  LAYERPILOT_ENV_FILE        Environment file to load before checks; default .env
  LAYERPILOT_GO_LIVE_DEPLOY  Set true to run deploy before smoke/backup checks; default false
  LAYERPILOT_GO_LIVE_QC      Set false to skip host npm QC; default true
  LAYERPILOT_GO_LIVE_SUPPORT_ON_FAILURE
                             Set false to skip automatic support bundle creation on failure; default true
  LAYERPILOT_GO_LIVE_REPORT  Optional exact path for the sanitized evidence report
  LAYERPILOT_GO_LIVE_REPORT_DIR
                             Directory for the default timestamped evidence report; default release

This command is intended for an Ubuntu host after `.env` has been created. It verifies
deployment assets, optional host QC, live smoke checks, backups, restore-drill, and
ops-checks without redefining success around a single narrow check.
EOF
}

check_boolean() {
  local name="$1"
  local value="$2"
  case "$value" in
    true|false) ;;
    *)
      echo "$name must be true or false." >&2
      exit 2
      ;;
  esac
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    exit 1
  fi
}

latest_backup() {
  local backup_dir="${LAYERPILOT_BACKUP_DIR:-$HOME/layerpilot-backups}"
  find "$backup_dir" -maxdepth 1 -type f -name 'layerpilot-data-*.tgz' -printf '%T@ %p\n' 2>/dev/null | sort -nr | sed -n '1{s/^[^ ]* //;p;}'
}

git_value() {
  local fallback="$1"
  shift
  if command -v git >/dev/null 2>&1 && git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    git "$@" 2>/dev/null || printf "%s" "$fallback"
  else
    printf "%s" "$fallback"
  fi
}

go_live_report_path() {
  if [ -n "$REPORT_PATH" ]; then
    printf "%s" "$REPORT_PATH"
    return 0
  fi
  mkdir -p "$REPORT_DIR"
  printf "%s/go-live-evidence-%s.md" "${REPORT_DIR%/}" "$(date -u +%Y%m%dT%H%M%SZ)"
}

report_public_origin() {
  local raw="${LAYERPILOT_PUBLIC_URL:-http://127.0.0.1:8797}"
  printf "%s" "$raw" | sed -E 's#^([A-Za-z][A-Za-z0-9+.-]*://)([^/@]+@)?([^/?#]*).*#\1\3#'
}

write_go_live_report() {
  local archive="$1"
  local report
  report="$(go_live_report_path)"
  mkdir -p "$(dirname "$report")"
  local finished_at branch commit deploy_result qc_result public_url
  finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  branch="$(git_value "unknown" rev-parse --abbrev-ref HEAD)"
  commit="$(git_value "unknown" rev-parse --short HEAD)"
  public_url="$(report_public_origin)"
  if [ "$RUN_DEPLOY" = "true" ]; then
    deploy_result="passed"
  else
    deploy_result="skipped"
  fi
  if [ "$RUN_LOCAL_QC" = "true" ] && command -v npm >/dev/null 2>&1 && [ -f package-lock.json ]; then
    qc_result="passed"
  else
    qc_result="skipped"
  fi
  cat > "$report" <<EOF
# 3DSTU FarmFlow Go-Live Evidence

- Generated UTC: $finished_at
- Started UTC: $STARTED_AT
- Branch: $branch
- Commit: $commit
- Environment file: $ENV_FILE
- Public URL: $public_url
- Result: passed

## Checks

- Bash syntax: passed
- Setup preflight: passed
- Deployment doctor: passed
- Host QC: $qc_result
- Deploy: $deploy_result
- Smoke: passed
- Backup: passed
- Backup verify: passed
- Restore drill: passed
- Ops check: passed

## Backup

- Backup archive: $archive

## Notes

- This report intentionally excludes passwords, tokens, API keys, and full environment values.
- Attach this file to the release handoff with the release commit and deployment notes.
EOF
  echo "Go-live evidence report written: $report"
}

on_failure() {
  local exit_code=$?
  trap - ERR
  echo "3DSTU FarmFlow go-live check failed with exit code $exit_code." >&2
  if [ "$SUPPORT_ON_FAILURE" = "true" ] && [ -f scripts/ubuntu-support-bundle.sh ]; then
    echo "Creating support bundle for failed go-live check..." >&2
    bash scripts/ubuntu-support-bundle.sh || true
  fi
  exit "$exit_code"
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

check_boolean "LAYERPILOT_GO_LIVE_DEPLOY" "$RUN_DEPLOY"
check_boolean "LAYERPILOT_GO_LIVE_QC" "$RUN_LOCAL_QC"
check_boolean "LAYERPILOT_GO_LIVE_SUPPORT_ON_FAILURE" "$SUPPORT_ON_FAILURE"
trap on_failure ERR

need_command bash
need_command docker
need_command curl
need_command tar

echo "== 3DSTU FarmFlow go-live check =="

echo "== Bash syntax =="
bash -n scripts/ubuntu-deploy.sh
bash -n scripts/ubuntu-backup.sh
bash -n scripts/ubuntu-ops-check.sh
bash -n scripts/ubuntu-setup.sh
bash -n scripts/ubuntu-package.sh
bash -n scripts/ubuntu-support-bundle.sh

echo "== Setup preflight =="
bash scripts/ubuntu-setup.sh preflight

echo "== Deployment doctor =="
bash scripts/ubuntu-deploy.sh doctor

if [ "$RUN_LOCAL_QC" = "true" ] && command -v npm >/dev/null 2>&1 && [ -f package-lock.json ]; then
  echo "== Host QC =="
  npm ci
  npm run qc
else
  echo "== Host QC skipped =="
fi

if [ "$RUN_DEPLOY" = "true" ]; then
  echo "== Deploy =="
  bash scripts/ubuntu-deploy.sh deploy
else
  echo "== Deploy skipped =="
fi

echo "== Smoke =="
bash scripts/ubuntu-deploy.sh smoke

echo "== Backup =="
bash scripts/ubuntu-backup.sh backup

archive="$(latest_backup)"
if [ -z "$archive" ]; then
  echo "No backup archive found after backup." >&2
  exit 1
fi

echo "== Backup verify =="
bash scripts/ubuntu-backup.sh verify "$archive"

echo "== Restore drill =="
bash scripts/ubuntu-backup.sh restore-drill "$archive"

echo "== Ops check =="
bash scripts/ubuntu-deploy.sh ops-check

write_go_live_report "$archive"

echo "3DSTU FarmFlow go-live check passed."
