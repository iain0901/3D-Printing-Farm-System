# Installation Guide

3DSTU FarmFlow can run locally for evaluation or under Docker Compose for production-like use.

## Local Development

```bash
npm install
npm run dev
```

In another terminal:

```bash
npm run api
```

The frontend runs on the Vite URL shown in the terminal. The API defaults to `http://127.0.0.1:8797` and stores local JSON data at `api/data/layerpilot.db.json`.

## Docker Compose

```bash
cp .env.example .env
# edit .env before starting production-like services
docker compose up --build
```

Set real values for:

- `LAYERPILOT_ADMIN_EMAIL`
- `LAYERPILOT_ADMIN_PASSWORD`
- `LAYERPILOT_WORKSPACE_NAME`
- `LAYERPILOT_WORKER_TOKEN`
- `LAYERPILOT_METRICS_TOKEN`
- `LAYERPILOT_SESSION_TTL_HOURS`, defaults to `168`
- `LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS`, defaults to `24`

For customer production, also set:

- `LAYERPILOT_DISABLE_DEFAULT_USERS=true`
- `LAYERPILOT_DISABLE_DEMO_LOGIN=true`

## Ubuntu VPS

Use the Ubuntu deployment assets in `deploy/ubuntu/`.

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

For public HTTPS deployment, follow `deploy/ubuntu/README.md` to install Docker, Nginx, UFW rules, Certbot, backup timers, and ops-check timers.

## Verification

Before go-live:

```bash
npm run qc
scripts/ubuntu-deploy.sh doctor
LAYERPILOT_SMOKE_URL=http://127.0.0.1:8797 \
LAYERPILOT_SMOKE_EMAIL=owner@example.com \
LAYERPILOT_SMOKE_PASSWORD='replace-with-the-real-password' \
npm run smoke:prod
```

Then complete `docs/PRODUCTION_READINESS.md`.
