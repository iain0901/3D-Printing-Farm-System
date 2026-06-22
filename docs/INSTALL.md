# Installation Guide

3DSTU FarmFlow can run as a local development app, a Docker Compose service, or a production Ubuntu deployment behind Nginx and HTTPS.

## Quick Docker Start

```bash
git clone https://github.com/iain0901/3D-Printing-Farm-System.git
cd 3D-Printing-Farm-System
cp .env.example .env
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:8797/api/health
```

Open `http://127.0.0.1:8797`.

## Production Ubuntu Pattern

Use a domain, Nginx, HTTPS, Docker Compose, a private `.env`, backups, and smoke checks.

```bash
cd /opt/layerpilot
scripts/ubuntu-deploy.sh doctor
scripts/ubuntu-deploy.sh deploy
scripts/ubuntu-go-live-check.sh
```

For a public domain:

```bash
LAYERPILOT_DOMAIN=farm.example.com \
LAYERPILOT_CERTBOT_EMAIL=support@example.com \
bash scripts/ubuntu-setup.sh all farm.example.com support@example.com
```

## Required Production Settings

- `LAYERPILOT_PUBLIC_URL`
- `LAYERPILOT_ADMIN_EMAIL`
- `LAYERPILOT_ADMIN_PASSWORD`
- `LAYERPILOT_DISABLE_DEMO_LOGIN=true`
- `LAYERPILOT_DISABLE_DEFAULT_USERS=true`
- `LAYERPILOT_WORKER_TOKEN`
- `LAYERPILOT_METRICS_TOKEN`

## Update Flow

```bash
cd /opt/layerpilot
git pull
scripts/ubuntu-deploy.sh update
curl -fsS http://127.0.0.1:8797/api/readiness
```

Every stage release should bump `package.json`, run `npm run qc`, deploy, smoke test, commit, and push to GitHub.
