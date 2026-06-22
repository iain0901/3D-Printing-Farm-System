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

BACKUP_DIR="${LAYERPILOT_BACKUP_DIR:-$HOME/layerpilot-backups}"
VOLUME_NAME="${LAYERPILOT_VOLUME_NAME:-layerpilot_layerpilot-data}"
RETENTION_DAYS="${LAYERPILOT_BACKUP_RETENTION_DAYS:-30}"
LOCK_DIR="${LAYERPILOT_BACKUP_LOCK_DIR:-$BACKUP_DIR/.layerpilot-backup.lock}"

usage() {
  cat <<'EOF'
Usage:
  scripts/ubuntu-backup.sh backup
  scripts/ubuntu-backup.sh restore /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
  scripts/ubuntu-backup.sh verify /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
  scripts/ubuntu-backup.sh restore-drill /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
  scripts/ubuntu-backup.sh prune
  scripts/ubuntu-backup.sh list

Environment:
  LAYERPILOT_BACKUP_DIR             Backup destination, default ~/layerpilot-backups
  LAYERPILOT_VOLUME_NAME            Docker volume name, default layerpilot_layerpilot-data
  LAYERPILOT_BACKUP_RETENTION_DAYS  Delete backups older than this many days after backup/prune, default 30; set 0 to disable
  LAYERPILOT_BACKUP_LOCK_DIR        Directory lock used to prevent concurrent backup/restore jobs
  LAYERPILOT_PRE_RESTORE_BACKUP     Create a safeguard archive before destructive restore, default true
EOF
}

compose() {
  docker compose "$@"
}

need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Missing command: docker" >&2
    exit 1
  fi
  docker compose version >/dev/null
}

need_tar() {
  if ! command -v tar >/dev/null 2>&1; then
    echo "Missing command: tar" >&2
    exit 1
  fi
}

validate_retention() {
  case "$RETENTION_DAYS" in
    ''|*[!0-9]*)
      echo "LAYERPILOT_BACKUP_RETENTION_DAYS must be a non-negative whole number." >&2
      exit 2
      ;;
  esac
}

validate_lock_dir() {
  case "$LOCK_DIR" in
    ""|"/"|"/."|"."|"..")
      echo "LAYERPILOT_BACKUP_LOCK_DIR is unsafe: $LOCK_DIR" >&2
      exit 2
      ;;
  esac
  case "$LOCK_DIR" in
    *$'\n'*|*$'\r'*)
      echo "LAYERPILOT_BACKUP_LOCK_DIR must not contain newlines." >&2
      exit 2
      ;;
  esac
}

release_lock() {
  if [ -n "${LOCK_HELD:-}" ] && [ -d "$LOCK_DIR" ]; then
    rm -rf "$LOCK_DIR"
  fi
}

acquire_lock() {
  validate_lock_dir
  mkdir -p "$(dirname "$LOCK_DIR")"
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_HELD=1
    printf "%s\n" "$$" > "$LOCK_DIR/pid"
    trap release_lock EXIT
    return 0
  fi
  local owner="unknown"
  if [ -f "$LOCK_DIR/pid" ]; then
    owner="$(cat "$LOCK_DIR/pid" 2>/dev/null || printf "unknown")"
  fi
  echo "Another 3DSTUXXX backup/restore operation appears to be running (lock: $LOCK_DIR, pid: $owner)." >&2
  echo "If no such process exists, remove the lock directory manually and retry." >&2
  exit 1
}

verify_archive() {
  need_tar
  local archive="${1:-}"
  if [ -z "$archive" ] || [ ! -f "$archive" ]; then
    echo "Verify requires an existing .tgz archive path." >&2
    usage
    exit 2
  fi
  if ! tar tzf "$archive" >/dev/null; then
    echo "Backup archive failed tar integrity check: $archive" >&2
    exit 1
  fi
  local members
  members="$(tar tzf "$archive")"
  if ! printf '%s\n' "$members" | grep -Eq '(^|/)(layerpilot\.db\.json|layerpilot\.sqlite)$'; then
    echo "Warning: backup archive does not appear to contain layerpilot.db.json or layerpilot.sqlite." >&2
  fi
  if printf '%s\n' "$members" | grep -Eq '(^|/)storage/'; then
    echo "Backup archive contains local storage payloads."
  else
    echo "Warning: backup archive does not contain a storage/ directory; this is expected only when using external object storage or no uploaded files exist." >&2
  fi
  echo "Backup archive verified: $archive"
}

restore_drill() {
  need_docker
  local archive="${1:-}"
  if [ -z "$archive" ] || [ ! -f "$archive" ]; then
    echo "Restore drill requires an existing .tgz archive path." >&2
    usage
    exit 2
  fi
  verify_archive "$archive"
  local drill_volume="layerpilot-restore-drill-$(date +%Y%m%d%H%M%S)-$$"
  cleanup_drill() {
    docker volume rm "$drill_volume" >/dev/null 2>&1 || true
  }
  trap cleanup_drill RETURN
  local archive_name
  archive_name="$(basename "$archive")"
  docker volume create "$drill_volume" >/dev/null
  docker run --rm \
    -e "LAYERPILOT_ARCHIVE_NAME=$archive_name" \
    -v "$drill_volume:/data" \
    -v "$(dirname "$archive"):/backup:ro" \
    alpine sh -c 'tar xzf "/backup/$LAYERPILOT_ARCHIVE_NAME" -C /data'
  docker run --rm \
    -v "$drill_volume:/data:ro" \
    alpine sh -c "test -f /data/layerpilot.db.json -o -f /data/layerpilot.sqlite"
  cleanup_drill
  trap - RETURN
  echo "Restore drill passed; temporary Docker volume removed: $drill_volume"
}

prune_backups() {
  validate_retention
  mkdir -p "$BACKUP_DIR"
  if [ "$RETENTION_DAYS" = "0" ]; then
    echo "Backup retention pruning disabled."
    return 0
  fi
  echo "Pruning 3DSTUXXX backups older than $RETENTION_DAYS day(s) from $BACKUP_DIR..."
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'layerpilot-data-*.tgz' -mtime +"$RETENTION_DAYS" -print -delete
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'layerpilot-pre-restore-*.tgz' -mtime +"$RETENTION_DAYS" -print -delete
}

pre_restore_backup_enabled() {
  case "${LAYERPILOT_PRE_RESTORE_BACKUP:-true}" in
    true|1|yes|on)
      return 0
      ;;
    false|0|no|off)
      return 1
      ;;
    *)
      echo "LAYERPILOT_PRE_RESTORE_BACKUP must be true or false when set." >&2
      exit 2
      ;;
  esac
}

create_pre_restore_backup() {
  mkdir -p "$BACKUP_DIR"
  if ! pre_restore_backup_enabled; then
    echo "Pre-restore safeguard backup disabled by LAYERPILOT_PRE_RESTORE_BACKUP."
    return 0
  fi
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local target="$BACKUP_DIR/layerpilot-pre-restore-$stamp.tgz"
  echo "Creating pre-restore safeguard backup before replacing production data..."
  docker run --rm \
    -v "$VOLUME_NAME:/data:ro" \
    -v "$BACKUP_DIR:/backup" \
    alpine sh -c "tar czf /backup/$(basename "$target") -C /data ."
  verify_archive "$target"
  echo "Pre-restore safeguard backup written: $target"
}

backup() {
  need_docker
  mkdir -p "$BACKUP_DIR"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local target="$BACKUP_DIR/layerpilot-data-$stamp.tgz"
  local services_stopped=0
  restart_services() {
    if [ "$services_stopped" = "1" ]; then
      compose up -d
      services_stopped=0
    fi
  }
  trap restart_services RETURN
  echo "Stopping services for a consistent volume snapshot..."
  compose stop
  services_stopped=1
  docker run --rm \
    -v "$VOLUME_NAME:/data:ro" \
    -v "$BACKUP_DIR:/backup" \
    alpine sh -c "tar czf /backup/$(basename "$target") -C /data ."
  verify_archive "$target"
  restart_services
  prune_backups
  echo "Backup written: $target"
}

restore() {
  need_docker
  local archive="${1:-}"
  if [ -z "$archive" ] || [ ! -f "$archive" ]; then
    echo "Restore requires an existing .tgz archive path." >&2
    usage
    exit 2
  fi
  verify_archive "$archive"
  echo "Stopping services before restore..."
  compose stop
  create_pre_restore_backup
  local archive_name
  archive_name="$(basename "$archive")"
  docker run --rm \
    -e "LAYERPILOT_ARCHIVE_NAME=$archive_name" \
    -v "$VOLUME_NAME:/data" \
    -v "$(dirname "$archive"):/backup:ro" \
    alpine sh -c 'rm -rf /data/* /data/.[!.]* /data/..?* 2>/dev/null || true; tar xzf "/backup/$LAYERPILOT_ARCHIVE_NAME" -C /data'
  compose up -d
  echo "Restore complete from: $archive"
}

case "${1:-backup}" in
  backup)
    acquire_lock
    backup
    ;;
  prune)
    acquire_lock
    prune_backups
    ;;
  verify)
    verify_archive "${2:-}"
    ;;
  restore-drill)
    acquire_lock
    restore_drill "${2:-}"
    ;;
  restore)
    acquire_lock
    restore "${2:-}"
    ;;
  list)
    mkdir -p "$BACKUP_DIR"
    ls -lh "$BACKUP_DIR"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
