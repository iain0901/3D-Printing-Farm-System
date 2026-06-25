#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT_DIR"

PACKAGE_DIR="${LAYERPILOT_PACKAGE_DIR:-$ROOT_DIR/release}"

usage() {
  cat <<'EOF'
Usage:
  scripts/ubuntu-package.sh package
  scripts/ubuntu-package.sh verify /path/to/layerpilot-ubuntu-YYYYmmdd-HHMMSS.tgz

Environment:
  LAYERPILOT_DIR          Project root, default parent of this script
  LAYERPILOT_PACKAGE_DIR  Output directory for release bundles, default ./release

The package command creates a source deployment bundle for copying to an Ubuntu
server when git is not available. It uses an allowlist and then verifies that
required deployment files are present while local data, secrets, and bulky build
artifacts are absent.
When sha256sum is available, package also writes a .sha256 sidecar and verify
checks it when the sidecar is present.
EOF
}

need_tar() {
  if ! command -v tar >/dev/null 2>&1; then
    echo "Missing command: tar" >&2
    exit 1
  fi
}

write_checksum() {
  local archive="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    (
      cd "$(dirname "$archive")"
      sha256sum "$(basename "$archive")" >"$(basename "$archive").sha256"
    )
    echo "Release checksum written: $archive.sha256"
  else
    echo "sha256sum is not available; skipping release checksum sidecar." >&2
  fi
}

verify_checksum_if_present() {
  local archive="$1"
  local checksum="$archive.sha256"
  if [ ! -f "$checksum" ]; then
    return 0
  fi
  if ! command -v sha256sum >/dev/null 2>&1; then
    echo "sha256sum is not available; cannot verify checksum sidecar: $checksum" >&2
    exit 1
  fi
  (
    cd "$(dirname "$archive")"
    sha256sum -c "$(basename "$archive").sha256"
  )
}

verify_archive() {
  need_tar
  local archive="${1:-}"
  if [ -z "$archive" ] || [ ! -f "$archive" ]; then
    echo "verify requires an existing .tgz archive path." >&2
    usage
    exit 2
  fi
  local members
  members="$(tar tzf "$archive" | sed 's#^\./##')"
  for required in \
    package.json \
    package-lock.json \
    Dockerfile \
    docker-compose.yml \
    src/App.tsx \
    api/server.mjs \
    api/worker.mjs \
    scripts/ops-auth-check.mjs \
    scripts/ubuntu-deploy.sh \
    scripts/ubuntu-backup.sh \
    scripts/ubuntu-setup.sh \
    scripts/ubuntu-go-live-check.sh \
    scripts/ubuntu-package.sh \
    scripts/package-ubuntu.mjs \
    scripts/ubuntu-support-bundle.sh \
    deploy/ubuntu/nginx.layerpilot.conf \
    .env.example; do
    if ! printf '%s\n' "$members" | grep -qx "$required"; then
      echo "Release bundle is missing required file: $required" >&2
      exit 1
    fi
  done
  if printf '%s\n' "$members" | grep -Eq '(^|/)(node_modules|dist|release|work|coverage|\.git|api/data|api/storage)(/|$)|(^|/)\.env$|\.tgz$|\.tar$|\.tar\.gz$|layerpilot-(support|data|pre-restore)-'; then
    echo "Release bundle contains forbidden local data, secret, backup, or build artifact paths." >&2
    exit 1
  fi
  verify_checksum_if_present "$archive"
  echo "Release bundle verified: $archive"
}

create_package() {
  need_tar
  mkdir -p "$PACKAGE_DIR"
  local stamp
  stamp="$(date +%Y%m%d-%H%M%S)"
  local target="$PACKAGE_DIR/layerpilot-ubuntu-$stamp.tgz"
  tar czf "$target" \
    --exclude='api/*.test.mjs' \
    --exclude='api/data' \
    --exclude='api/storage' \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='release' \
    --exclude='work' \
    --exclude='coverage' \
    --exclude='.git' \
    --exclude='.env' \
    --exclude='*.tgz' \
    --exclude='*.tar' \
    --exclude='*.tar.gz' \
    .dockerignore \
    .env.example \
    .gitignore \
    Dockerfile \
    docker-compose.yml \
    index.html \
    package-lock.json \
    package.json \
    README.md \
    tsconfig.json \
    vite.config.ts \
    api \
    deploy \
    public \
    scripts \
    src
  write_checksum "$target"
  verify_archive "$target"
  echo "Ubuntu release bundle written: $target"
}

case "${1:-package}" in
  package)
    create_package
    ;;
  verify)
    verify_archive "${2:-}"
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
