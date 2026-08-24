# Installation Guide

3DSTU FarmFlow can run locally for evaluation or under Docker Compose for production-like use.

## Local Development

```bash
npm ci
npm run install:frontend
npm run dev
```

In another terminal:

```bash
npm run api
```

The single maintained Vue/Rspack frontend runs at `http://127.0.0.1:5174`. The API defaults to `http://127.0.0.1:8797` and stores local JSON data at `api/data/layerpilot.db.json`.

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
- `LAYERPILOT_PUBLIC_URL`
- `LAYERPILOT_CORS_ORIGINS`, only when an additional browser origin needs to call the API
- `LAYERPILOT_SESSION_TTL_HOURS`, defaults to `168`
- `LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS`, defaults to `24`
- `LAYERPILOT_AUTH_LOCK_THRESHOLD`, defaults to `5`
- `LAYERPILOT_AUTH_LOCK_MINUTES`, defaults to `15`

In production, `LAYERPILOT_WORKER_TOKEN` is accepted only through the `x-layerpilot-worker-token` header and `LAYERPILOT_METRICS_TOKEN` only through the `x-layerpilot-metrics-token` header. Do not put these shared tokens in URLs.

In production, browser CORS is limited to the origin from `LAYERPILOT_PUBLIC_URL` plus comma-separated `LAYERPILOT_CORS_ORIGINS`. Leave `LAYERPILOT_CORS_ORIGINS` blank for same-origin app/API deployments. Add only explicit `http://` or `https://` origins for separate public quote portals or admin frontends; wildcard origins are rejected.

When enabling the existing Chatwoot panel, set all `CHATWOOT_*` values as a group and include the panel host in `LAYERPILOT_CORS_ORIGINS` when it is served from a separate origin. When enabling AI, set `AI_PROVIDER`, `AI_MODEL`, `AI_API_BASE_URL`, and `AI_API_KEY` together. If Orca profile paths are set, both paths must be mounted below `/profiles/`. `scripts/ubuntu-deploy.sh doctor` validates these combinations without printing secret values.

If `LAYERPILOT_WORKER_TELEMETRY` or `LAYERPILOT_WORKER_BRIDGE_POLLING` is enabled in production, `/api/readiness` expects the background worker to write a recent heartbeat to the shared data store. Keep the API and worker services on the same volume/database path and check the worker logs if readiness reports a stale or missing `worker` check.

If workspace API-key IP restrictions are enabled, use only IPv4 addresses or IPv4 CIDR ranges in `allowedApiIps`, for example `203.0.113.25` or `203.0.113.0/24`. Production `/api/readiness` fails when the persisted allowlist is empty or invalid.

For customer production, also set:

- `LAYERPILOT_DISABLE_DEFAULT_USERS=true`
- `LAYERPILOT_DISABLE_DEMO_LOGIN=true`

There is no self-service signup route; each customer gets its own environment. Use `scripts/provision-tenant.sh --slug <name> --admin-email <email>` to scaffold a new isolated customer deployment with a generated bootstrap Owner.

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

## Slicer CLI (real slicing + real gram/minute quotes)

The API can slice models server-side with a real CLI slicer. When a slicer is
available, slicer jobs run `--auto-orient` + `--arrange` with a generated
support/layer/infill config, then quote from the **actual G-code** grams and
minutes (feeding the auto-quote pricing engine) instead of rough estimates.

Ubuntu install (23.04+/24.04 universe; `scripts/ubuntu-setup.sh` does this
automatically during `install-deps`):

```bash
sudo apt update && sudo apt install -y prusa-slicer
```

Older Ubuntu releases: use the official PrusaSlicer AppImage headless
(`./PrusaSlicer-*.AppImage --appimage-extract`) and point
`LAYERPILOT_SLICER_CMD` at the extracted binary.

Behavior when no CLI slicer is found: jobs fall back to the internal adapter
(estimate-based), exactly as before. OrcaSlicer/Bambu Studio are also detected
but are meant to run through the dedicated `orca-worker` process. Model checks
(dimensions vs build volume, triangle sanity, format) run before every job and
block slicing with a clear reason when they fail.
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
