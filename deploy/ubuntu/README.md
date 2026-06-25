# 3DSTU FarmFlow Ubuntu Deployment

This guide deploys 3DSTU FarmFlow on Ubuntu 22.04 or 24.04 with Docker Compose. The app runs on port `8797`; Compose binds that port to `127.0.0.1` by default so Nginx can proxy public HTTP/HTTPS traffic to it.

Localized deployment guides:

- [繁體中文](README.zh-TW.md)
- [简体中文](README.zh-CN.md)

For professional technical support or installation services, contact `support@3dstu.com`.

## 1. Install Server Dependencies

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl ufw nginx
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
newgrp docker
docker compose version
```

Recommended firewall:

```bash
bash scripts/ubuntu-setup.sh install-firewall
```

The helper allows OpenSSH, HTTP, and HTTPS only. It does not expose port `8797`; keep `LAYERPILOT_BIND_ADDRESS=127.0.0.1` and let Nginx proxy to the app locally.

If you use `bash scripts/ubuntu-setup.sh install-deps` or `all`, the helper installs `curl` before Docker setup, adds the detected non-root deployment user to the `docker` group, and prints a reminder to run `newgrp docker` or reconnect before running non-sudo Docker deployment commands.

## 2. Place The App On The Server

Clone or copy this project to a stable path:

```bash
sudo mkdir -p /opt/layerpilot
sudo chown -R "$USER":"$USER" /opt/layerpilot
cd /opt/layerpilot
# git clone <your-private-repo-url> .
```

If you copy a zip instead of using git, unpack it so `docker-compose.yml`, `Dockerfile`, `package.json`, `api/`, `src/`, `deploy/`, and `scripts/` are directly under `/opt/layerpilot`.

The included `.dockerignore` keeps local databases, uploaded files, support bundles, backup archives, `node_modules`, deployment docs, and other workspace-only files out of the Docker build context. Keep that file with the project when copying it to the server.

If git is unavailable, create a verified Ubuntu release bundle from your build machine:

```bash
npm run package:ubuntu
```

The npm command calls the cross-platform `node scripts/package-ubuntu.mjs package` entrypoint, writes `release/layerpilot-ubuntu-YYYYmmdd-HHMMSS.tgz` plus a `release/layerpilot-ubuntu-YYYYmmdd-HHMMSS.tgz.sha256` checksum sidecar, and verifies that required deployment files are present while `.env`, local databases, uploaded files, `node_modules`, build outputs, support bundles, and backup archives are absent. It only requires Node and a system `tar` command, so it can run from Windows, macOS, Linux, or the Ubuntu server itself. The Ubuntu Bash equivalent remains available as `bash scripts/ubuntu-package.sh package`.

After copying the archive to the server, you can verify it before extracting:

```bash
sha256sum -c layerpilot-ubuntu-YYYYmmdd-HHMMSS.tgz.sha256
bash scripts/ubuntu-package.sh verify /path/to/layerpilot-ubuntu-YYYYmmdd-HHMMSS.tgz
```

Extract it under `/opt/layerpilot`, then continue with setup.

Run the setup preflight from the project root:

```bash
bash scripts/ubuntu-setup.sh preflight
```

The setup helper can also install base dependencies, Docker log rotation, timers, the Nginx site, and HTTPS certificates. These commands are idempotent where possible:

```bash
bash scripts/ubuntu-setup.sh install-deps
bash scripts/ubuntu-setup.sh install-firewall
bash scripts/ubuntu-setup.sh install-log-rotation
bash scripts/ubuntu-setup.sh install-backup-timer
bash scripts/ubuntu-setup.sh install-ops-timer
bash scripts/ubuntu-setup.sh install-nginx your-domain.example
bash scripts/ubuntu-setup.sh install-https your-domain.example owner@example.com
```

For a fresh server after the app is already under `/opt/layerpilot`, you can run the combined setup. With both a domain and email it installs base dependencies, firewall rules, Docker log rotation, timers, Nginx, and HTTPS:

```bash
bash scripts/ubuntu-setup.sh all your-domain.example owner@example.com
```

If you omit the email, the combined setup installs through Nginx and skips HTTPS so you can run `install-https` later.

If an existing `/etc/docker/daemon.json` differs from 3DSTU FarmFlow's sample, `install-log-rotation` stops and asks you to merge settings manually. Set `LAYERPILOT_OVERWRITE_DOCKER_DAEMON=true` only when you intentionally want the helper to back up and replace that file.

Setup boolean flags such as `LAYERPILOT_OVERWRITE_DOCKER_DAEMON` and `LAYERPILOT_CERTBOT_STAGING` must be literal `true` or `false`; the preflight stops on other values so production setup does not silently choose the wrong branch.

Recommended Docker log rotation for production servers:

```bash
sudo cp deploy/ubuntu/docker-daemon.json /etc/docker/daemon.json
sudo systemctl restart docker
```

If `/etc/docker/daemon.json` already exists, merge the `log-driver` and `log-opts` values from `deploy/ubuntu/docker-daemon.json` instead of replacing your existing Docker settings. The Compose services also define per-service `json-file` log rotation, so the containers remain bounded even before host-wide Docker defaults are applied.

## 3. Create Production Secrets

Run this from the project root. Use a long owner password.

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh init-env
```

The script creates `.env` with private permissions, shell/Compose-safe quoted values, a `LAYERPILOT_PUBLIC_URL` used by smoke checks, and random worker/metrics tokens. Edit `.env` if you need Stripe, MQTT, S3-compatible storage, or external slicer integration. Environment values may contain spaces and punctuation, but must not contain newlines.

By default, `.env` sets `LAYERPILOT_BIND_ADDRESS=127.0.0.1`. Keep that setting when using Nginx. Set it to `0.0.0.0` only if you intentionally want to expose `:8797` directly on the server network.

## 4. Deploy

Run the production preflight first:

```bash
scripts/ubuntu-deploy.sh doctor
```

The doctor check verifies Docker Compose, current-user access to the Docker daemon, required deployment files, private `.env` permissions, required production secrets, demo/default user disabling, non-default and minimum-length worker/metrics tokens, password length, boolean/numeric environment values, public/billing URL formats, S3 settings when object storage is enabled, Stripe price/webhook settings when billing is configured, MQTT URL/QoS/retain settings when event streaming is configured, and Compose config rendering. Live `/api/readiness` also fails when workspace API-key IP restrictions are enabled with an empty or invalid IPv4/CIDR allowlist. If Docker was just installed, run `newgrp docker` or reconnect before running deploy commands as a non-root user.

```bash
scripts/ubuntu-deploy.sh deploy
```

The deploy command runs the doctor check, builds the Docker image, starts the API/web container and worker, waits for `/api/readiness`, then runs `npm run smoke:prod` or curl-only smoke checks against the live app.

`deploy`, `update`, and `rollback` use a directory lock so only one service-changing operation runs at a time. The default lock is `/tmp/layerpilot-deploy.lock`; override it with `LAYERPILOT_DEPLOY_LOCK_DIR` only if your server policy requires another lock location. If a command reports an existing lock, verify no deployment is still running before removing the lock directory manually.

Useful operations:

```bash
scripts/ubuntu-deploy.sh doctor
scripts/ubuntu-deploy.sh status
scripts/ubuntu-deploy.sh logs
scripts/ubuntu-deploy.sh smoke
scripts/ubuntu-deploy.sh ops-check
scripts/ubuntu-deploy.sh rollback /var/backups/layerpilot/layerpilot-data-YYYYmmdd-HHMMSS.tgz
scripts/ubuntu-deploy.sh support-bundle
docker compose ps
```

## 4.1 Go-Live Verification

After `.env` is ready and before treating a server as production-ready, run the bundled go-live check:

```bash
scripts/ubuntu-go-live-check.sh
```

It loads `.env`, then runs Bash syntax checks, setup preflight, deployment doctor, optional host `npm run qc`, live smoke checks, a verified backup, restore-drill, and ops-check. Loading `.env` keeps values like `LAYERPILOT_BACKUP_DIR`, `LAYERPILOT_PUBLIC_URL`, and smoke-check credentials consistent with deployment. By default it assumes the app is already deployed. To include deployment in the same pass:

```bash
LAYERPILOT_GO_LIVE_DEPLOY=true scripts/ubuntu-go-live-check.sh
```

Set `LAYERPILOT_GO_LIVE_QC=false` only on minimal servers where Node/npm are intentionally absent outside the Docker image.

If any go-live step fails, the script creates a redacted support bundle by default so the failed server state can be inspected later. Set `LAYERPILOT_GO_LIVE_SUPPORT_ON_FAILURE=false` only when you intentionally do not want this failure artifact.

## 5. Nginx Reverse Proxy

After DNS points your domain to the Ubuntu server, install or refresh the Nginx site:

```bash
bash scripts/ubuntu-setup.sh install-nginx your-domain.example
```

The setup helper validates the domain before writing the Nginx site. Use a DNS-safe hostname with labels of 1-63 characters; labels cannot start or end with `-`, and the full domain must be 253 characters or fewer.

The helper copies the sample Nginx config, replaces `layerpilot.example.com`, enables the site, runs `nginx -t`, and reloads Nginx. You can do the same manually:

```bash
sudo cp deploy/ubuntu/nginx.layerpilot.conf /etc/nginx/sites-available/layerpilot
sudo sed -i 's/layerpilot.example.com/your-domain.example/g' /etc/nginx/sites-available/layerpilot
sudo ln -sf /etc/nginx/sites-available/layerpilot /etc/nginx/sites-enabled/layerpilot
sudo nginx -t
sudo systemctl reload nginx
```

The sample Nginx site forwards WebSocket upgrades for realtime dashboards, disables proxy buffering so server-sent events flush promptly, preserves forwarded host/protocol headers, extends proxy read/send timeouts for long-running realtime connections, allows slower model uploads with `client_body_timeout 300s`, and adds baseline browser security headers. Keep `client_max_body_size 250m` or raise it if your print files are larger.

Add HTTPS with Certbot after the Nginx site is reachable over HTTP:

```bash
bash scripts/ubuntu-setup.sh install-https your-domain.example owner@example.com
```

To test against Let's Encrypt staging first:

```bash
LAYERPILOT_CERTBOT_STAGING=true bash scripts/ubuntu-setup.sh install-https your-domain.example owner@example.com
```

The helper installs `certbot` and `python3-certbot-nginx`, runs `certbot --nginx` with redirect enabled, and shows the `certbot.timer` renewal schedule. The equivalent manual commands are:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.example --agree-tos --email owner@example.com --redirect --non-interactive
```

## 6. Backups

Compose sets the project name to `layerpilot`, so the persistent Docker volume is deterministically materialized as `layerpilot_layerpilot-data`. It contains the JSON/SQLite database and local model storage. Back it up before upgrades:

```bash
chmod +x scripts/ubuntu-backup.sh
scripts/ubuntu-backup.sh backup
scripts/ubuntu-backup.sh verify ~/layerpilot-backups/layerpilot-data-YYYYmmdd-HHMMSS.tgz
scripts/ubuntu-backup.sh restore-drill ~/layerpilot-backups/layerpilot-data-YYYYmmdd-HHMMSS.tgz
scripts/ubuntu-backup.sh prune
scripts/ubuntu-backup.sh list
```

`backup` verifies the newly written archive before pruning old backups. `verify` runs a tar integrity check and warns if the archive does not contain a database file or local `storage/` payloads. `restore-drill` extracts an archive into a temporary Docker volume, confirms a 3DSTU FarmFlow database file is present, then removes the temporary volume without touching production data.

The backup script reads `.env` before applying defaults, so production values such as `LAYERPILOT_BACKUP_RETENTION_DAYS`, `LAYERPILOT_BACKUP_DIR`, and `LAYERPILOT_VOLUME_NAME` can be kept with the rest of the deployment configuration. `LAYERPILOT_BACKUP_RETENTION_DAYS` defaults to `30`. Set it to another whole number before running `backup` or `prune`, or set it to `0` to disable automatic pruning. Pruning covers normal `layerpilot-data-*.tgz` archives and pre-restore safeguard backups.

Backup, prune, restore, and restore-drill commands use a directory lock to avoid overlapping with the nightly timer or an update-time backup. The default lock is stored inside the backup directory; override it with `LAYERPILOT_BACKUP_LOCK_DIR` only if your backup storage path cannot host lock directories.

To enable automatic nightly backups on Ubuntu, install the included systemd timer:

```bash
sudo mkdir -p /var/backups/layerpilot
sudo cp deploy/ubuntu/layerpilot-backup.service /etc/systemd/system/
sudo cp deploy/ubuntu/layerpilot-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now layerpilot-backup.timer
systemctl list-timers layerpilot-backup.timer
```

The timer runs the backup script at 02:30 daily with a small randomized delay, stores archives in `/var/backups/layerpilot`, and prunes backups older than 30 days. The included service explicitly requires Docker, has a 30-minute timeout, and enables basic systemd hardening such as `NoNewPrivileges`, `PrivateTmp`, and `ProtectSystem=full`. When installed through `scripts/ubuntu-setup.sh install-backup-timer`, the helper renders the systemd unit with the current project path. If you manually copy the service file and deploy somewhere other than `/opt/layerpilot`, update `WorkingDirectory` and `ExecStart` before enabling the timer.

Restore a backup only after confirming the target server should be replaced:

```bash
scripts/ubuntu-backup.sh restore ~/layerpilot-backups/layerpilot-data-YYYYmmdd-HHMMSS.tgz
scripts/ubuntu-deploy.sh smoke
```

`restore` verifies the archive before stopping services and replacing the Docker volume. By default it also writes a pre-restore safeguard backup named `layerpilot-pre-restore-YYYYmmdd-HHMMSS.tgz` from the current production volume after services are stopped and before the volume is replaced. Keep this enabled unless you intentionally set `LAYERPILOT_PRE_RESTORE_BACKUP=false` for a controlled recovery drill.

Run a restore drill periodically, especially after changing storage settings or before major upgrades.

For S3-compatible object storage, also back up the bucket or configure object lifecycle/versioning with your storage provider.

## 7. Updates

Use the update command for normal releases:

```bash
cd /opt/layerpilot
scripts/ubuntu-deploy.sh update
```

`update` runs the doctor preflight, pulls the current git checkout with `git pull --ff-only` when available, installs dependencies and runs `npm run qc` when Node/npm are installed on the host, creates a Docker volume backup, deploys the updated containers, waits for readiness, and runs smoke checks.

If a release must be rolled back after deployment, restore the pre-update backup and re-run smoke and ops checks:

```bash
scripts/ubuntu-deploy.sh rollback /var/backups/layerpilot/layerpilot-data-YYYYmmdd-HHMMSS.tgz
```

If no archive path is supplied, `rollback` uses the newest `layerpilot-data-*.tgz` in `LAYERPILOT_BACKUP_DIR`.

## 8. Operations Check

After the first deployment and after each release, run:

```bash
scripts/ubuntu-deploy.sh ops-check
```

The ops check verifies Docker Compose service state, `/api/health`, `/api/readiness`, frontend reachability, authenticated state and audit access when credentials are available, metrics-token access when configured, latest backup presence, backup filesystem free space, `layerpilot-backup.timer`, and Docker log rotation. Set `LAYERPILOT_OPS_EMAIL` and `LAYERPILOT_OPS_PASSWORD` to use a dedicated smoke account instead of the bootstrap owner. Set `LAYERPILOT_MIN_FREE_MB` to change the minimum free-space threshold; the default is `2048` MB.

To run the same check every 15 minutes through systemd:

```bash
bash scripts/ubuntu-setup.sh install-ops-timer
systemctl list-timers layerpilot-ops-check.timer
systemctl status layerpilot-ops-check.service
journalctl -u layerpilot-ops-check.service -n 100 --no-pager
```

The timer logs warnings and failures to the systemd journal. A hard failure, such as the app container being stopped or `/api/readiness` being unreachable, makes the service fail so it is visible through `systemctl status`.

When installed through `scripts/ubuntu-setup.sh install-ops-timer`, the helper renders the ops-check systemd unit with the current project path. If you manually copy the service file from `deploy/ubuntu/`, update `WorkingDirectory` and `ExecStart` if the app is not under `/opt/layerpilot`.

## 8.1 Support Bundle

When a production server needs troubleshooting, generate a redacted support bundle:

```bash
scripts/ubuntu-deploy.sh support-bundle
```

This calls `scripts/ubuntu-support-bundle.sh` and writes `layerpilot-support-YYYYmmdd-HHMMSS.tgz` under `/tmp/layerpilot-support` by default. The bundle includes OS details, disk usage, Docker and Compose status, recent 3DSTU FarmFlow container logs, health/readiness responses, backup archive listings, timer status, and a redacted `.env` summary. Values whose names look secret, such as passwords, tokens, API keys, credentials, and private keys, are replaced with `REDACTED`. Review the archive before sharing it outside your organization.

Keep `.env` out of git. The production containers use `.env`, Docker named volume persistence, healthchecks, `no-new-privileges`, a 30-second graceful stop window, per-service log rotation, and a non-root Node runtime user.

## 9. Production Notes

- Use `LAYERPILOT_DISABLE_DEFAULT_USERS=true` and `LAYERPILOT_DISABLE_DEMO_LOGIN=true` for real deployments.
- Use a strong `LAYERPILOT_ADMIN_PASSWORD`.
- Keep `LAYERPILOT_BIND_ADDRESS=127.0.0.1` behind Nginx unless you intentionally expose port `8797`.
- Configure Stripe only after you have real price IDs and webhook routing.
- The current app supports workspace isolation on the JSON/SQLite document store. For larger public multi-tenant SaaS scale, migrate to Postgres with row-level security.
