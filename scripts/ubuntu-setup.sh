#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${LAYERPILOT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$ROOT_DIR"

NGINX_DOMAIN="${LAYERPILOT_DOMAIN:-${2:-}}"
CERTBOT_EMAIL="${LAYERPILOT_CERTBOT_EMAIL:-${3:-}}"
CERTBOT_STAGING="${LAYERPILOT_CERTBOT_STAGING:-false}"
OVERWRITE_DOCKER_DAEMON="${LAYERPILOT_OVERWRITE_DOCKER_DAEMON:-false}"

usage() {
  cat <<'EOF'
Usage:
  scripts/ubuntu-setup.sh preflight
  scripts/ubuntu-setup.sh install-deps
  scripts/ubuntu-setup.sh install-firewall
  scripts/ubuntu-setup.sh install-log-rotation
  scripts/ubuntu-setup.sh install-backup-timer
  scripts/ubuntu-setup.sh install-ops-timer
  scripts/ubuntu-setup.sh install-nginx your-domain.example
  scripts/ubuntu-setup.sh install-https your-domain.example owner@example.com
  scripts/ubuntu-setup.sh all [your-domain.example] [owner@example.com]

Environment:
  LAYERPILOT_DIR                       Project root, default parent of this script
  LAYERPILOT_DOMAIN                    Domain for install-nginx/install-https/all when not passed as an argument
  LAYERPILOT_CERTBOT_EMAIL             Email for install-https when not passed as an argument
  LAYERPILOT_CERTBOT_STAGING           Set true to request a Let's Encrypt staging certificate
  LAYERPILOT_OVERWRITE_DOCKER_DAEMON   Set true to replace /etc/docker/daemon.json after backing it up
EOF
}

need_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing command: $1" >&2
    return 1
  fi
}

check_boolean_env() {
  local name="$1"
  local value="$2"
  case "$value" in
    true|false) ;;
    *)
      echo "$name must be true or false." >&2
      return 1
      ;;
  esac
}

require_project_files() {
  for file in Dockerfile docker-compose.yml deploy/ubuntu/nginx.layerpilot.conf deploy/ubuntu/docker-daemon.json deploy/ubuntu/layerpilot-backup.service deploy/ubuntu/layerpilot-backup.timer deploy/ubuntu/layerpilot-ops-check.service deploy/ubuntu/layerpilot-ops-check.timer scripts/ubuntu-deploy.sh scripts/ubuntu-backup.sh scripts/ubuntu-ops-check.sh scripts/ubuntu-go-live-check.sh scripts/ubuntu-package.sh scripts/ubuntu-support-bundle.sh; do
    if [ ! -f "$file" ]; then
      echo "Missing required project file: $file" >&2
      return 1
    fi
  done
}

preflight() {
  require_project_files
  check_boolean_env "LAYERPILOT_CERTBOT_STAGING" "$CERTBOT_STAGING"
  check_boolean_env "LAYERPILOT_OVERWRITE_DOCKER_DAEMON" "$OVERWRITE_DOCKER_DAEMON"
  need_command sudo
  need_command systemctl
  if ! command -v curl >/dev/null 2>&1; then
    echo "Warning: curl is not installed yet; install-deps will install it before Docker setup." >&2
  fi
  if [ -f /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    if [ "${ID:-}" != "ubuntu" ]; then
      echo "Warning: this setup script is tuned for Ubuntu; detected ${PRETTY_NAME:-unknown OS}." >&2
    fi
  fi
  echo "3DSTUXXX Ubuntu setup preflight passed."
}

configure_docker_group() {
  local target_user="${SUDO_USER:-${USER:-}}"
  if [ -z "$target_user" ] || [ "$target_user" = "root" ]; then
    echo "Skipping Docker group user setup because no non-root deployment user was detected."
    return 0
  fi
  if getent group docker >/dev/null 2>&1; then
    sudo usermod -aG docker "$target_user"
    echo "Added $target_user to the docker group. Run 'newgrp docker' or reconnect before running non-sudo docker deploy commands."
  fi
}

sed_escape_replacement() {
  printf "%s" "$1" | sed 's/[\/&|]/\\&/g'
}

install_systemd_unit_template() {
  local source="$1"
  local target="$2"
  local rendered
  local escaped_root
  rendered="$(mktemp)"
  escaped_root="$(sed_escape_replacement "$ROOT_DIR")"
  sed "s|/opt/layerpilot|$escaped_root|g" "$source" > "$rendered"
  sudo install -m 0644 "$rendered" "$target"
  rm -f "$rendered"
}

install_deps() {
  require_project_files
  need_command sudo
  need_command systemctl
  sudo apt update
  sudo apt install -y ca-certificates curl git openssl ufw nginx
  if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sudo sh
  fi
  docker compose version >/dev/null || sudo docker compose version >/dev/null
  configure_docker_group
  echo "Base dependencies are installed."
}

install_firewall() {
  require_project_files
  need_command sudo
  if ! command -v ufw >/dev/null 2>&1; then
    sudo apt update
    sudo apt install -y ufw
  fi
  sudo ufw allow OpenSSH
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  sudo ufw status verbose
  echo "UFW firewall enabled for OpenSSH, HTTP, and HTTPS. Port 8797 remains private behind Nginx."
}

install_log_rotation() {
  preflight
  local target="/etc/docker/daemon.json"
  if [ -f "$target" ] && ! cmp -s deploy/ubuntu/docker-daemon.json "$target"; then
    if [ "$OVERWRITE_DOCKER_DAEMON" != "true" ]; then
      echo "$target already exists and differs from deploy/ubuntu/docker-daemon.json." >&2
      echo "Merge log-driver/log-opts manually, or set LAYERPILOT_OVERWRITE_DOCKER_DAEMON=true to replace it with a timestamped backup." >&2
      return 1
    fi
    sudo cp "$target" "$target.layerpilot-$(date +%Y%m%d-%H%M%S).bak"
  fi
  sudo install -m 0644 deploy/ubuntu/docker-daemon.json "$target"
  sudo systemctl restart docker
  echo "Docker log rotation installed."
}

install_backup_timer() {
  preflight
  sudo mkdir -p /var/backups/layerpilot
  install_systemd_unit_template deploy/ubuntu/layerpilot-backup.service /etc/systemd/system/layerpilot-backup.service
  sudo install -m 0644 deploy/ubuntu/layerpilot-backup.timer /etc/systemd/system/layerpilot-backup.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now layerpilot-backup.timer
  systemctl list-timers layerpilot-backup.timer --no-pager || true
  echo "3DSTUXXX backup timer installed."
}

install_ops_timer() {
  preflight
  install_systemd_unit_template deploy/ubuntu/layerpilot-ops-check.service /etc/systemd/system/layerpilot-ops-check.service
  sudo install -m 0644 deploy/ubuntu/layerpilot-ops-check.timer /etc/systemd/system/layerpilot-ops-check.timer
  sudo systemctl daemon-reload
  sudo systemctl enable --now layerpilot-ops-check.timer
  systemctl list-timers layerpilot-ops-check.timer --no-pager || true
  echo "3DSTUXXX ops-check timer installed."
}

validate_domain() {
  local domain="$1"
  if [ -z "$domain" ]; then
    echo "A domain is required for install-nginx. Example: scripts/ubuntu-setup.sh install-nginx prints.example.com" >&2
    return 1
  fi
  if [ "${#domain}" -gt 253 ]; then
    echo "Invalid domain: $domain" >&2
    echo "Domain names must be 253 characters or fewer." >&2
    return 1
  fi
  case "$domain" in
    *[!A-Za-z0-9.-]*|.*|*..*|*.)
      echo "Invalid domain: $domain" >&2
      return 1
      ;;
  esac
  local label
  local old_ifs="$IFS"
  IFS='.'
  for label in $domain; do
    IFS="$old_ifs"
    if [ -z "$label" ] || [ "${#label}" -gt 63 ]; then
      echo "Invalid domain label in $domain: $label" >&2
      return 1
    fi
    case "$label" in
      -*|*-)
        echo "Invalid domain label in $domain: $label" >&2
        echo "Domain labels must not start or end with '-'." >&2
        return 1
        ;;
    esac
    IFS='.'
  done
  IFS="$old_ifs"
}

install_nginx() {
  preflight
  validate_domain "$NGINX_DOMAIN"
  sudo install -m 0644 deploy/ubuntu/nginx.layerpilot.conf /etc/nginx/sites-available/layerpilot
  sudo sed -i "s/layerpilot.example.com/$NGINX_DOMAIN/g" /etc/nginx/sites-available/layerpilot
  sudo ln -sf /etc/nginx/sites-available/layerpilot /etc/nginx/sites-enabled/layerpilot
  sudo nginx -t
  sudo systemctl reload nginx
  echo "Nginx site installed for $NGINX_DOMAIN."
}

validate_email() {
  local email="$1"
  if [ -z "$email" ]; then
    echo "An email is required for install-https. Example: scripts/ubuntu-setup.sh install-https prints.example.com owner@example.com" >&2
    return 1
  fi
  case "$email" in
    *@*.*)
      ;;
    *)
      echo "Invalid email: $email" >&2
      return 1
      ;;
  esac
}

install_https() {
  preflight
  validate_domain "$NGINX_DOMAIN"
  validate_email "$CERTBOT_EMAIL"
  sudo apt update
  sudo apt install -y certbot python3-certbot-nginx
  sudo nginx -t
  local staging_arg=()
  if [ "$CERTBOT_STAGING" = "true" ]; then
    staging_arg=(--staging)
  fi
  sudo certbot --nginx -d "$NGINX_DOMAIN" --agree-tos --email "$CERTBOT_EMAIL" --redirect --non-interactive "${staging_arg[@]}"
  systemctl list-timers certbot.timer --no-pager || true
  echo "HTTPS certificate installed for $NGINX_DOMAIN."
}

install_all() {
  preflight
  install_deps
  install_firewall
  install_log_rotation
  install_backup_timer
  install_ops_timer
  if [ -n "$NGINX_DOMAIN" ]; then
    install_nginx
    if [ -n "$CERTBOT_EMAIL" ]; then
      install_https
    else
      echo "Skipping HTTPS install because no Certbot email was provided."
    fi
  else
    echo "Skipping Nginx site install because no domain was provided."
  fi
}

case "${1:-help}" in
  preflight)
    preflight
    ;;
  install-deps)
    install_deps
    ;;
  install-firewall)
    install_firewall
    ;;
  install-log-rotation)
    install_log_rotation
    ;;
  install-backup-timer)
    install_backup_timer
    ;;
  install-ops-timer)
    install_ops_timer
    ;;
  install-nginx)
    install_nginx
    ;;
  install-https)
    install_https
    ;;
  all)
    install_all
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    usage
    exit 2
    ;;
esac
