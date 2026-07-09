#!/usr/bin/env bash
set -euo pipefail

# provision-tenant.sh
# Scaffold a new, independent 3DSTU FarmFlow customer environment:
#   - a private, hardened .env with strong random secrets
#   - an optional Nginx virtual host for the customer domain
#   - a copy-paste handoff summary
#
# It does NOT run Docker itself. Deployment stays with the well-tested
# scripts/ubuntu-deploy.sh so this tool is safe to --dry-run anywhere.
#
# Each environment is fully isolated by COMPOSE_PROJECT_NAME, container name,
# host port, and Docker data volume, so several customers can share one host.

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

SLUG=""
DOMAIN=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
ADMIN_NAME="Production Owner"
WORKSPACE_NAME=""
HOST_PORT="8797"
PROJECT_NAME=""
CONTAINER_NAME=""
OUTPUT_DIR=""
DRY_RUN="false"
FORCE="false"

usage() {
  cat <<'EOF'
Usage:
  scripts/provision-tenant.sh --slug <name> --admin-email <email> [options]

Required:
  --slug <name>            DNS-safe id for this customer (a-z, 0-9, -). e.g. acme-lab
  --admin-email <email>    Owner login email for the new environment

Options:
  --domain <host>          Public domain, enables HTTPS public URL + Nginx vhost
  --admin-password <pw>    Owner password (>=14 chars). Default: generated + shown once
  --admin-name <name>      Owner display name. Default: "Production Owner"
  --workspace-name <name>  Workspace name. Default: derived from the slug
  --host-port <port>       Host port to publish. Default: 8797.
                           Give co-hosted customers unique ports (8797, 8798, ...).
  --project-name <name>    Compose project name. Default: farmflow-<slug>
  --output-dir <dir>       Where to write files. Default: <repo>/tenants/<slug>
  --dry-run                Print what would be written, write nothing
  --force                  Overwrite an existing env file
  -h, --help               Show this help

Example:
  scripts/provision-tenant.sh \
    --slug acme-lab \
    --domain farm.acme.example \
    --admin-email owner@acme.example \
    --host-port 8798
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 48
  fi
}

random_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 24
  else
    tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24
  fi
}

env_quote() {
  printf "'"
  printf "%s" "${1:-}" | sed "s/'/'\\\\''/g"
  printf "'"
}

write_env_line() {
  case "${2:-}" in
    *$'\n'*|*$'\r'*)
      die "Environment value for $1 must not contain newlines."
      ;;
  esac
  printf "%s=%s\n" "$1" "$(env_quote "${2:-}")"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --slug) SLUG="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --admin-email) ADMIN_EMAIL="${2:-}"; shift 2 ;;
    --admin-password) ADMIN_PASSWORD="${2:-}"; shift 2 ;;
    --admin-name) ADMIN_NAME="${2:-}"; shift 2 ;;
    --workspace-name) WORKSPACE_NAME="${2:-}"; shift 2 ;;
    --host-port) HOST_PORT="${2:-}"; shift 2 ;;
    --project-name) PROJECT_NAME="${2:-}"; shift 2 ;;
    --output-dir) OUTPUT_DIR="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN="true"; shift ;;
    --force) FORCE="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (see --help)" ;;
  esac
done

# --- validation ---
[ -n "$SLUG" ] || { usage >&2; die "--slug is required."; }
[ -n "$ADMIN_EMAIL" ] || die "--admin-email is required."
printf "%s" "$SLUG" | grep -Eq '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' \
  || die "--slug must be DNS-safe: lowercase letters, digits, and hyphens (2-40 chars)."
printf "%s" "$ADMIN_EMAIL" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' \
  || die "--admin-email does not look like an email address."
printf "%s" "$HOST_PORT" | grep -Eq '^[0-9]+$' || die "--host-port must be a number."
[ "$HOST_PORT" -ge 1 ] && [ "$HOST_PORT" -le 65535 ] || die "--host-port must be 1-65535."
if [ -n "$DOMAIN" ]; then
  printf "%s" "$DOMAIN" | grep -Eq '^[A-Za-z0-9.-]+$' || die "--domain contains invalid characters."
fi

# --- derive defaults ---
PROJECT_NAME="${PROJECT_NAME:-farmflow-$SLUG}"
CONTAINER_NAME="farmflow-$SLUG"
WORKSPACE_NAME="${WORKSPACE_NAME:-$SLUG}"
OUTPUT_DIR="${OUTPUT_DIR:-$ROOT_DIR/tenants/$SLUG}"
ENV_FILE="$OUTPUT_DIR/$SLUG.env"
VHOST_FILE="$OUTPUT_DIR/nginx.$SLUG.conf"

if [ -n "$DOMAIN" ]; then
  PUBLIC_URL="https://$DOMAIN"
else
  PUBLIC_URL="http://127.0.0.1:$HOST_PORT"
fi

GENERATED_PASSWORD="false"
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD="$(random_password)"
  GENERATED_PASSWORD="true"
elif [ "${#ADMIN_PASSWORD}" -lt 14 ]; then
  die "--admin-password should be at least 14 characters for production."
fi

WORKER_TOKEN="$(random_secret)"
METRICS_TOKEN="$(random_secret)"

build_env() {
  write_env_line "COMPOSE_PROJECT_NAME" "$PROJECT_NAME"
  write_env_line "LAYERPILOT_CONTAINER_NAME" "$CONTAINER_NAME"
  write_env_line "LAYERPILOT_HOST_PORT" "$HOST_PORT"
  write_env_line "LAYERPILOT_ADMIN_EMAIL" "$ADMIN_EMAIL"
  write_env_line "LAYERPILOT_ADMIN_PASSWORD" "$ADMIN_PASSWORD"
  write_env_line "LAYERPILOT_ADMIN_NAME" "$ADMIN_NAME"
  write_env_line "LAYERPILOT_WORKSPACE_NAME" "$WORKSPACE_NAME"
  write_env_line "LAYERPILOT_PUBLIC_URL" "$PUBLIC_URL"
  write_env_line "LAYERPILOT_CORS_ORIGINS" ""
  write_env_line "LAYERPILOT_BIND_ADDRESS" "127.0.0.1"
  # Single-tenant hardening: one owner, no self-service signup, no demo login.
  write_env_line "LAYERPILOT_DISABLE_DEFAULT_USERS" "true"
  write_env_line "LAYERPILOT_DISABLE_DEMO_LOGIN" "true"
  write_env_line "LAYERPILOT_METRICS_TOKEN" "$METRICS_TOKEN"
  write_env_line "LAYERPILOT_WORKER_TOKEN" "$WORKER_TOKEN"
  write_env_line "LAYERPILOT_OPS_EMAIL" ""
  write_env_line "LAYERPILOT_OPS_PASSWORD" ""
  write_env_line "LAYERPILOT_AUTO_BACKUP_ON_MIGRATE" "true"
  write_env_line "LAYERPILOT_DB_ADAPTER" "json"
  write_env_line "LAYERPILOT_BACKUP_RETENTION_DAYS" "30"
  write_env_line "LAYERPILOT_PRE_RESTORE_BACKUP" "true"
  write_env_line "LAYERPILOT_DEPLOY_LOCK_DIR" "/tmp/layerpilot-deploy-$SLUG.lock"
  write_env_line "LAYERPILOT_WORKER_ID" "farmflow-$SLUG-worker"
  write_env_line "LAYERPILOT_WORKER_TELEMETRY" "false"
  write_env_line "LAYERPILOT_WORKER_BRIDGE_POLLING" "true"
}

build_vhost() {
  cat <<VHOST
map \$http_upgrade \$farmflow_${SLUG//-/_}_upgrade {
    default upgrade;
    '' close;
}

server {
    listen 80;
    server_name $DOMAIN;

    client_max_body_size 250m;
    client_body_timeout 300s;

    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options SAMEORIGIN always;
    add_header Referrer-Policy strict-origin-when-cross-origin always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    location / {
        proxy_pass http://127.0.0.1:$HOST_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$farmflow_${SLUG//-/_}_upgrade;
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_connect_timeout 60s;
        proxy_read_timeout 3600;
        proxy_send_timeout 3600;
    }
}
VHOST
}

print_summary() {
  cat <<EOF

=== 3DSTU FarmFlow customer environment: $SLUG ===
  Public URL         : $PUBLIC_URL
  Admin email        : $ADMIN_EMAIL
  Admin password     : $ADMIN_PASSWORD$( [ "$GENERATED_PASSWORD" = "true" ] && printf "   (generated - store it now, it is not saved elsewhere)" )
  Compose project    : $PROJECT_NAME
  Container name      : $CONTAINER_NAME / $CONTAINER_NAME-worker
  Host port          : 127.0.0.1:$HOST_PORT
  Env file           : $ENV_FILE
$( [ -n "$DOMAIN" ] && printf "  Nginx vhost        : %s\n" "$VHOST_FILE" )
Next steps on the server (from the repo root):
  1. cp $ENV_FILE .env            # or: export LAYERPILOT_ENV_FILE=$ENV_FILE
  2. bash scripts/ubuntu-deploy.sh doctor
  3. bash scripts/ubuntu-deploy.sh deploy
$( [ -n "$DOMAIN" ] && printf "  4. sudo install -m 0644 %s /etc/nginx/sites-available/farmflow-%s.conf\n     sudo ln -sf /etc/nginx/sites-available/farmflow-%s.conf /etc/nginx/sites-enabled/\n     sudo nginx -t && sudo systemctl reload nginx\n     sudo certbot --nginx -d %s\n" "$VHOST_FILE" "$SLUG" "$SLUG" "$DOMAIN" )
EOF
}

if [ "$DRY_RUN" = "true" ]; then
  echo "# --- DRY RUN: no files written ---"
  echo "# env file -> $ENV_FILE"
  build_env
  if [ -n "$DOMAIN" ]; then
    echo "# nginx vhost -> $VHOST_FILE"
    build_vhost
  fi
  print_summary
  exit 0
fi

if [ -f "$ENV_FILE" ] && [ "$FORCE" != "true" ]; then
  die "$ENV_FILE already exists. Use --force to overwrite (this rotates its secrets)."
fi

umask 077
mkdir -p "$OUTPUT_DIR"
build_env > "$ENV_FILE"
chmod 600 "$ENV_FILE"
if [ -n "$DOMAIN" ]; then
  build_vhost > "$VHOST_FILE"
fi
echo "Wrote $ENV_FILE (permissions 600)."
[ -n "$DOMAIN" ] && echo "Wrote $VHOST_FILE."
print_summary
