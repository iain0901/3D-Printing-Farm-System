# 3DSTU FarmFlow

[![CI](https://github.com/iain0901/3D-Printing-Farm-System/actions/workflows/ci.yml/badge.svg)](https://github.com/iain0901/3D-Printing-Farm-System/actions/workflows/ci.yml)

3DSTU FarmFlow is an original 3D printing production operating system MVP for studios, labs, and small print farms. It focuses on structured tasks, model files, printer capability matching, scheduling, automatic todos, and exception-driven operations.

Localized documentation:

- [繁體中文 README](README.zh-TW.md)
- [简体中文 README](README.zh-CN.md)
- [繁體中文授權](LICENSE.zh-TW.md)
- [简体中文许可](LICENSE.zh-CN.md)

For professional technical support or installation services, contact `support@3dstu.com`.

Project links:

- Website: https://farm-saas.3dstu.com
- GitHub: https://github.com/iain0901/3D-Printing-Farm-System
- Installation guide: docs/INSTALL.md
- Operations runbook: docs/OPERATIONS.md
- Product roadmap: docs/ROADMAP.md
- Release runbook: docs/RELEASE.md


## License

3DSTU FarmFlow is developed by 3DSTU as a free SaaS platform for 3DSTU farm customers. It is source-available under the [3DSTU Farm Customer Source-Available License](LICENSE.md): customers may run, modify, and use it internally to operate their own 3D printing farms and earn revenue from their own printed parts or production services, but may not sell, redistribute, rebrand, host, white-label, or commercially provide the software, modified versions, scripts, Docker images, or related services to third parties without a separate written agreement from 3DSTU.

## Run Locally

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal, usually `http://127.0.0.1:5173`.

To run the local backend API in another terminal:

```bash
npm run api
```

The API listens on `http://127.0.0.1:8797`, persists data to `api/data/layerpilot.db.json`, and exposes:

## Run With Docker

Create a production-like environment file, then build and run the container:

```bash
cp .env.example .env
# edit .env and set your real owner email/password
docker compose up --build
```

Then open `http://127.0.0.1:8797`. Compose starts an API/web service plus a `layerpilot-worker` background service from the same image. The web container serves the built React app and Fastify API, runs as the non-root `node` user, uses `no-new-privileges`, has a 30-second graceful stop window, per-service JSON log rotation, and exposes a container healthcheck against `/api/health`. The worker runs telemetry ticks and OctoPrint, Moonraker, and PrusaLink polling, then notifies the API over an internal worker-token endpoint so WebSocket/SSE clients receive fresh state. Data is stored in the `layerpilot-data` Docker volume at `/data/layerpilot.db.json`, and uploaded model files are stored under `/data/storage` by default. Set `LAYERPILOT_OBJECT_STORAGE_PROVIDER=s3` to use S3-compatible object storage instead.

## Deploy On Ubuntu

Ubuntu 22.04/24.04 deployment assets live in `deploy/ubuntu/`.

Fast path on a fresh server:

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

The script creates `.env` with shell/Compose-safe quoted production values, generated worker/metrics tokens when needed, a `LAYERPILOT_PUBLIC_URL` for live smoke checks, and a localhost bind by default for Nginx proxying. It runs a `doctor` preflight for deployment files, private `.env` permissions, production secrets, password/token strength, environment value formats, optional S3/Stripe/MQTT configuration consistency, and Compose config before building Docker Compose services, waiting for readiness, and running smoke checks. Compose uses the fixed project name `layerpilot`, so the persistent Docker volume is `layerpilot_layerpilot-data`. For a public domain with Nginx and HTTPS, follow `deploy/ubuntu/README.md`; after the app is placed under `/opt/layerpilot`, `scripts/ubuntu-setup.sh all your-domain.example owner@example.com` installs base dependencies, UFW firewall rules, Docker log rotation, the backup timer, an ops-check timer, the Nginx site with WebSocket/SSE-friendly proxying and browser security headers, and Certbot HTTPS. Use `scripts/ubuntu-go-live-check.sh` on the Ubuntu host to load `.env`, run Bash syntax checks, setup preflight, deployment doctor, optional host QC, live smoke checks, verified backup, restore drill, and ops-check in one pass. Use `scripts/ubuntu-deploy.sh update` for normal releases; it runs preflight, optional host QC, verified volume backup, deploy, readiness, and smoke checks. Use `scripts/ubuntu-deploy.sh rollback <archive.tgz>` to restore a known-good volume backup, then automatically run readiness, smoke, and ops checks; restore creates a pre-restore safeguard backup of the current production volume before replacing it. Use `scripts/ubuntu-deploy.sh ops-check` after deployment to verify services, health endpoints, authenticated state and audit access when credentials are configured, metrics-token access, backup state, timer state, disk space, and log rotation; `layerpilot-ops-check.timer` can run the same check every 15 minutes through systemd. Use `scripts/ubuntu-deploy.sh support-bundle` to generate a redacted troubleshooting archive with OS, Docker, health, logs, backup, and timer evidence; API support snapshots redact secret-like fields and URL paths/query strings while preserving host hints. Use `scripts/ubuntu-backup.sh backup` before manual upgrades, run `scripts/ubuntu-backup.sh restore-drill <archive.tgz>` to test restores without touching production data, or install the included `layerpilot-backup.timer` for nightly verified backups with locking and 30-day pruning; the backup helper reads `.env` before applying defaults.

After deployment, run a production smoke check from the host:

```bash
LAYERPILOT_SMOKE_URL=http://127.0.0.1:8797 \
LAYERPILOT_SMOKE_EMAIL=owner@example.com \
LAYERPILOT_SMOKE_PASSWORD=change-this-password \
npm run smoke:prod
```

Useful production environment variables:

- `LAYERPILOT_HOST`, default `0.0.0.0` in Docker
- `LAYERPILOT_API_PORT`, default `8797`
- `LAYERPILOT_DB_PATH`, default `/data/layerpilot.db.json` in Docker
- `LAYERPILOT_DB_ADAPTER`, `json` by default; set to `sqlite` with a `.sqlite` DB path for SQLite-backed document persistence
- `LAYERPILOT_STORAGE_DIR`, default `/data/storage` in Docker
- `LAYERPILOT_OBJECT_STORAGE_PROVIDER`, `local` or `s3`, default `local`
- `LAYERPILOT_S3_BUCKET`, `LAYERPILOT_S3_REGION`, `LAYERPILOT_S3_ENDPOINT`, `LAYERPILOT_S3_PREFIX`, `LAYERPILOT_S3_FORCE_PATH_STYLE`, `LAYERPILOT_S3_ACCESS_KEY_ID`, and `LAYERPILOT_S3_SECRET_ACCESS_KEY`, optional S3-compatible object storage configuration
- `LAYERPILOT_SERVE_STATIC`, set to `true` to serve `dist`
- `LAYERPILOT_ADMIN_EMAIL` and `LAYERPILOT_ADMIN_PASSWORD`, optional bootstrap Owner credentials for first deployment
- `LAYERPILOT_ADMIN_NAME`, optional bootstrap Owner display name
- `LAYERPILOT_WORKSPACE_NAME`, optional workspace name applied during bootstrap
- `LAYERPILOT_DISABLE_DEFAULT_USERS`, set to `true` for fresh production deployments to remove seeded default users
- `LAYERPILOT_DISABLE_DEMO_LOGIN`, set to `true` to prevent auto-creating the demo login
- `LAYERPILOT_SESSION_TTL_HOURS`, user session lifetime, default `168` hours
- `LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS`, idle user session timeout, default `24` hours
- `LAYERPILOT_METRICS_TOKEN`, optional token for Prometheus-style `/api/metrics` scraping without a user session
- `LAYERPILOT_OPS_EMAIL` and `LAYERPILOT_OPS_PASSWORD`, optional dedicated smoke account for `scripts/ubuntu-deploy.sh ops-check`; blank values fall back to the bootstrap admin credentials
- `LAYERPILOT_AUTO_BACKUP_ON_MIGRATE`, defaults to `true`; writes a sibling `*.pre-migration-*.bak.json` before schema migrations when an existing DB file is upgraded
- `LAYERPILOT_PRE_RESTORE_BACKUP`, defaults to `true`; writes a safeguard volume archive before restore or rollback replaces production data
- `LAYERPILOT_WORKER_TOKEN`, required for Docker worker-to-API state broadcasts; change the example value before real deployment
- `LAYERPILOT_WORKER_TELEMETRY` and `LAYERPILOT_WORKER_BRIDGE_POLLING`, enable or disable background worker jobs
- `LAYERPILOT_WORKER_TELEMETRY_INTERVAL_MS` and `LAYERPILOT_WORKER_BRIDGE_POLL_INTERVAL_MS`, background worker intervals
- `LAYERPILOT_BILLING_PORTAL_URL`, optional external billing portal destination
- `LAYERPILOT_STRIPE_SECRET_KEY`, optional Stripe API secret key for subscription checkout and billing portal sessions
- `LAYERPILOT_STRIPE_WEBHOOK_SECRET`, required in production when `/api/billing/webhook/stripe` is exposed
- `LAYERPILOT_STRIPE_PRICE_STUDIO`, `LAYERPILOT_STRIPE_PRICE_FARM`, and `LAYERPILOT_STRIPE_PRICE_ENTERPRISE`, optional Stripe recurring price IDs mapped to 3DSTU FarmFlow plans
- `LAYERPILOT_MQTT_URL`, optional MQTT broker URL used by the MQTT Event Stream add-on when it is enabled
- `LAYERPILOT_MQTT_TOPIC_PREFIX`, optional MQTT topic prefix, default `layerpilot`
- `LAYERPILOT_MQTT_USERNAME` and `LAYERPILOT_MQTT_PASSWORD`, optional MQTT broker credentials
- `LAYERPILOT_MQTT_QOS`, optional MQTT QoS value `0`, `1`, or `2`
- `LAYERPILOT_MQTT_RETAIN`, optional `true`/`false` retained-message flag
- `LAYERPILOT_SLICER_CMD`, optional external slicer executable such as PrusaSlicer, OrcaSlicer, or SuperSlicer
- `LAYERPILOT_SLICER_ARGS`, optional JSON array or space-separated args using `{input}`, `{output}`, and `{config}` placeholders

The production API also enables security headers through `@fastify/helmet` and route-level rate limiting through `@fastify/rate-limit` for authentication, API key creation, billing sessions, and admin exports.

Retry-prone order, queue, queue matching, scheduler automation, file/model artifact, slicer job/file-slice, todo action, history annotation/reprint, webhook test, notification test, bridge diagnostic/sync, printer action, public quote intake, public quote decision, quote update, quote portal-link generation or rotation, quote conversion, production-template, catalog/profile/printer configuration, catalog governance, integration configuration, governance setup, admin account management, inventory, maintenance, filament purchasing, commerce import, billing, and audit-retention writes accept an `Idempotency-Key` header. Supported routes replay the original successful response for the same actor, route, key, and body, and return `409` when a key is reused with different input. Queue matching retries replay the first committed assignment response without duplicating `queue.matched` audit events. Scheduler retries replay auto, optimized, and constraint scheduling responses without duplicating scheduling audit events. File/model artifact retries replay generated sample models, Hot Drop handling, parametric nameplates, metadata-created files, file deletion, and manual file-version bumps without creating duplicate stored model records, duplicate Hot Drop queue jobs, or duplicate file-version audit events. Slicer retries replay completed job/file-slice responses without creating duplicate slicer job records, G-code artifacts, file-version increments, or slicer audit events. Todo action retries replay without creating duplicate claim, snooze, complete, or reopen records. History annotation retries replay issue/waste updates without double-deducting spool inventory or duplicating `history.annotated` audit events. History reprint retries replay the first queued reprint job without creating duplicate queue jobs, todos, or `queue.reprint` audit events. Webhook and notification test retries replay without creating duplicate test events, delivery logs, or outbound test calls to external endpoints. Bridge diagnostic and sync retries replay before polling printer endpoints again, avoiding duplicate bridge audit events and repeated hardware status calls after dropped operator responses. Printer action retries replay before dispatching another bridge command, so pause/resume/cancel retries do not double-send to real hardware. Catalog, slicer profile, production-template, and printer capability setup retries replay without creating duplicate records or duplicate setup audit events. Integration configuration retries replay webhook, notification channel, commerce connector, add-on, and bridge setup responses without duplicating connector records or setup audit events. Governance setup retries replay workspace setting updates, onboarding checklist changes, and support snapshot generation without duplicating settings, onboarding, or support audit events. Admin account retries replay API-key create/update, user invite/update, and password-reset responses without rotating generated secrets again or duplicating governance audit events. Cost catalog and material-map retries replay without duplicating pricing or material-normalization audit/run records. Inventory retries cover spool creation, spool usage, scan-based usage/location updates, and spool label exports; label export retries return the original CSV/HTML artifact without duplicating `spool.labels_generated` audit events. Filament purchasing retries cover direct purchase-request create/update, reorder planning, and receive-to-inventory workflows without duplicating reorder records, update events, or received spools. Quote update retries replay reviewed quote responses without duplicating quote update audit events. Quote portal-link rotation retries replay the first generated URL and token instead of rotating again and invalidating the link already shown to an operator. The shipped public quote form, quote portal decision controls, daily operator controls for queue scheduling/status/priority/matching, scheduler automation, order creation/lifecycle/job generation, operator quote update/link/convert actions, file sample/version/delete/slice actions, Hot Drop, slicer jobs, printer bridge actions, spool creation/usage/scan/labels, generated todo actions, filament purchase requests/reorder/receive, team account controls, API-key controls, workspace settings, onboarding checklist, support snapshot, and billing controls generate and reuse idempotency keys for the same attempted payload until the request succeeds. Replay records are internal server metadata only; shared state and admin exports omit the idempotency ledger so response bodies from token-returning routes are not included in handoff bundles.

- `GET /api/health`
- `GET /api/readiness`
- `GET /api/metrics`
- `POST /api/internal/worker-broadcast` (internal worker token only)
- `POST /api/auth/login`
- `POST /api/auth/signup`
- `GET /api/auth/me`
- `POST /api/auth/2fa/setup`
- `POST /api/auth/2fa/enable`
- `POST /api/auth/2fa/disable`
- `POST /api/auth/change-password`
- `POST /api/auth/logout`
- `GET /api/printers`
- `GET /api/files`
- `GET /api/queue`
- `GET /api/todos`
- `POST /api/todos/:id/action`
- `GET /api/spools`
- `GET /api/maintenance`
- `GET /api/users`
- `GET /api/parts`
- `GET /api/skus`
- `GET /api/orders`
- `GET /api/profiles`
- `GET /api/addons`
- `PATCH /api/addons/:id`
- `GET /api/webhooks`
- `GET /api/events`
- `GET /api/events/stream`
- `GET /api/webhookDeliveries`
- `GET /api/mqttDeliveries`
- `GET /api/notificationChannels`
- `GET /api/notificationDeliveries`
- `GET /api/commerceConnectors`
- `GET /api/commerceImports`
- `GET /api/apiKeys`
- `GET /api/workspaceSettings`
- `GET /api/onboarding`
- `GET /api/bridges`
- `GET /api/schedule/diagnostics`
- `POST /api/schedule/auto`
- `POST /api/schedule/optimize`
- `POST /api/schedule/constraint`
- `GET /api/analytics`
- `GET /api/state`
- `GET /api/events/ws`
- `GET /api/admin/integrity`
- `POST /api/telemetry/tick`
- `POST /api/printers`
- `PATCH /api/printers/:id`
- `POST /api/files`
- `POST /api/files/upload`
- `POST /api/file-folders`
- `POST /api/files/sample`
- `POST /api/hot-drop`
- `GET /api/files/:id/download`
- `DELETE /api/files/:id`
- `POST /api/spools`
- `POST /api/spools/labels`
- `GET /api/spools/scan?code=...`
- `POST /api/spools/scan`
- `PATCH /api/spools/:id`
- `PATCH /api/spools/:id/usage`
- `POST /api/maintenance`
- `PATCH /api/maintenance/:id`
- `POST /api/maintenance/templates`
- `POST /api/maintenance/reports`
- `PATCH /api/profiles/:id/default`
- `PATCH /api/profile-policy`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `POST /api/parts`
- `PATCH /api/parts/:id`
- `POST /api/profiles`
- `POST /api/profiles/import`
- `PATCH /api/profiles/:id`
- `DELETE /api/profiles/:id`
- `POST /api/skus`
- `PATCH /api/skus/:id`
- `POST /api/orders/:id/generate-jobs`
- `POST /api/webhooks`
- `PATCH /api/webhooks/:id`
- `POST /api/webhooks/:id/test`
- `POST /api/notificationChannels`
- `PATCH /api/notificationChannels/:id`
- `POST /api/notificationChannels/:id/test`
- `POST /api/commerceConnectors`
- `PATCH /api/commerceConnectors/:id`
- `POST /api/commerceConnectors/:id/test`
- `POST /api/commerceConnectors/:id/import`
- `POST /api/commerce/import-csv`
- `POST /api/apiKeys`
- `PATCH /api/apiKeys/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/reset-password`
- `PATCH /api/workspaceSettings`
- `PATCH /api/onboarding/:id`
- `POST /api/support/snapshot`
- `GET /api/billing`
- `PATCH /api/billing/plan`
- `POST /api/billing/portal`
- `POST /api/billing/webhook/stripe`
- `GET /api/costCatalog`
- `PATCH /api/costCatalog`
- `POST /api/quotes`
- `GET /api/catalog/export`
- `POST /api/catalog/material-map`
- `POST /api/parametric/nameplate`
- `GET /api/analytics`
- `GET /api/history`
- `GET /api/audit`
- `GET /api/audit/export`
- `POST /api/admin/audit-retention/run`
- `PATCH /api/history/:id`
- `POST /api/history/:id/reprint`
- `GET /api/admin/export` with optional `?includeFiles=true` for a full backup containing stored model/G-code bytes
- `POST /api/admin/restore`
- `POST /api/orders/:id/generate-jobs` with optional `{ "dryRun": true }` for SKU/part/stock preflight and duplicate-generation protection
- `POST /api/queue`
- `POST /api/queue/match`
- `POST /api/bridges`
- `POST /api/bridges/sync`
- `POST /api/bridges/:id/test`
- `POST /api/printers/:id/sync`
- `PATCH /api/printers/:id/status`
- `PATCH /api/queue/:id/schedule`
- `PATCH /api/queue/:id/status`
- `PATCH /api/queue/:id/priority`
- `PATCH /api/files/:id/version`
- `GET /api/slicer/jobs`
- `POST /api/slicer/jobs`
- `PATCH /api/files/:id/slice`
- `POST /api/actions` for persisted printer actions (`start`, `pause`, `resume`, `cancel`, `home axes`, `preheat`, `cooldown`) with queue-job synchronization and optional bridge dispatch

To run the QC suite:

```bash
npm run qc
```

This runs the TypeScript/Vite production build plus API tests.

GitHub Actions runs the same QC gate on every push to `main` and every pull request. Release discipline and VPS deployment evidence are documented in `docs/RELEASE.md`.

Before using a customer deployment for live production, complete the checklist in `docs/PRODUCTION_READINESS.md`.

## Open Source Stack

- React, Vite, TypeScript, Recharts, and Lucide React for the app experience.
- Fastify and `@fastify/cors` for the backend API.
- `@fastify/helmet` and `@fastify/rate-limit` for production security headers and sensitive-route throttling.
- `@fastify/multipart` for production model uploads.
- LowDB-compatible persistence with a local JSON adapter for simple development and an optional `node:sqlite` adapter for SQLite-backed document storage.
- AWS SDK S3 client for optional S3-compatible model and G-code object storage.
- JSZip for reading 3MF model packages.
- Stripe's official Node SDK for optional subscription checkout, billing portal sessions, and Stripe-compatible billing webhook handling.
- MQTT.js for publishing production events to broker-backed automation systems.
- Zod for API payload validation.
- Native `fetch` bridge adapters for OctoPrint, Moonraker/Klipper, and PrusaLink HTTP APIs.
- Vitest for QC coverage of backend health, readiness and Prometheus-style metrics, Docker/Compose deployment packaging, production Owner bootstrap, default-user disabling, schema migration metadata, pre-migration backups, admin data-integrity checks, security headers, sensitive-route rate limiting, validation, persistence, scoped API key auth, API key IP/CIDR allowlist enforcement, TOTP two-factor auth enrollment/login/recovery-code consumption/disable flows, team invites, role updates, user password changes, admin password resets, workspace settings persistence, audit retention policy pruning, API-backed billing/storage usage, local and S3-compatible object storage flows, plan changes, internal/external/Stripe billing sessions, Stripe-compatible webhook updates, printer creation/capability updates, catalog operations, API-backed cost catalog and quote calculation, API-backed add-on marketplace status/config persistence, MQTT event delivery and secret-safe add-on responses, PWA manifest/service-worker/offline asset builds, authenticated WebSocket realtime state/event delivery, profile creation/import/update/archive/defaults/matching policy, SKU-to-job expansion, inventory operations, spool label generation and scan-code usage logging, maintenance workflows, maintenance templates and problem reports, order intake/status updates, file upload/download/delete with reference protection and storage cleanup, stored sample STL generation, file folder persistence, full backup export/restore with stored model bytes, commerce feed/CSV import, webhook delivery, notification channel delivery, realtime telemetry ticks, bridge polling sync, API-backed slicer jobs with stored G-code output and default profile resolution, scheduling warnings, automatic scheduling, material/color batching, load-balance optimization, constraint-solver scheduling with dry-run safety, queue matching dry-runs and committed production starts, persisted generated-todo actions, analytics/history annotation/reprint/admin export/restore, audit query/export permissions, hardware bridge adapters, and derived todos.

## Demo Login

Use the seeded demo account on the auth screen:

- Email: `demo@layerpilot.test`
- Password: `layerpilot`

The API uses local bearer-token sessions, password hashes, optional TOTP two-factor auth with one-time recovery codes, and role-based write permissions for core production actions. User responses, state exports, and backup exports strip password hashes, 2FA secrets, recovery-code hashes, quote portal bearer tokens, API-key secrets, idempotency replay records, and credential-bearing integration endpoint URL paths/query strings.

## Implemented MVP Areas

- API-backed auth, signup, logout, TOTP two-factor enrollment/login/recovery/disable flows, user password changes, admin password resets, local bearer-token sessions, password hashing, role-based permissions, and scoped automation API keys with hashed secrets
- Public quote intake with optional customer model uploads, shared file-library storage, automatic model metadata estimates, operator quote review, quote validity windows, customer tracking tokens, public status lookup, shareable/rotatable quote portal links, customer accept/reject/revision decisions, quote-to-order conversion, and attached-model handoff into the production queue
- Schema-versioned JSON/SQLite document persistence with automatic startup migrations, migration history, pre-migration backup files, readiness-linked data integrity checks, admin integrity reports for broken references, and configurable audit retention
- English / Traditional Chinese / Simplified Chinese language switcher with cleaned core production translations and a Vitest translation-coverage gate for visible static UI text
- Production cockpit dashboard answering today's tasks, due risk, idle printers, printer issues, and human todos
- Backend connection indicator with authenticated API hydration from `/api/state` when the local API is running
- Server-sent realtime state stream from `/api/events/stream`, with backend telemetry ticks updating production progress and completion-driven todos
- Printer list, detail drawer, API-backed add-printer wizard with capability/build-volume capture, and API-backed printer actions that synchronize printer state, active queue jobs, temperatures, progress, audit events, and optional hardware bridges
- Printer states aligned to production usage: `idle`, `printing`, `paused`, `offline`, `error`, and `maintenance`
- Products workspace with API-backed parts, SKUs, variants, file links, SKU/part/material CSV export, API-backed material alias mapping/normalization across parts, files, and queue jobs, and a parametric nameplate builder that generates stored STL files, quote estimates, and optional linked production parts
- Orders workspace with API-backed Shopify/Etsy/eBay/manual intake, token-safe and endpoint-redacted commerce connectors, JSON feed import, CSV import, duplicate external-order skipping, import history, SKU mapping, fulfillment status updates, SKU-linked queue job generation, preflight job plans, stock-change previews, catalog-gap warnings, and duplicate job-generation blocking
- Cloud files with real multipart model upload, local or S3-compatible stored file bytes, generated sample STL files, API-backed folder records, STL/G-code/3MF metadata parsing, API-backed download/delete with reference protection and storage cleanup, full backup export/restore of stored model and G-code bytes, API-backed version/slice actions, filters, folders, queue actions, file status, versions, model dimensions, thumbnails, and quote estimates
- Print queue with API-backed status, priority, printer assignment, matching dry-runs, committed queue-to-printer production starts, sortable queue, low-priority queue, automatic matching controls, production slots, bulk actions, and matching inspector
- Scheduler workspace with API-backed drag-to-schedule flow, an automatic scheduling engine, material/color batch optimization, load-balance optimization, `javascript-lp-solver` constraint scheduling for balanced cost, due-risk, and changeover-minimizing objectives, an unscheduled task pool, printer capability list, production timeline, inline selected-task risk summary, stored schedule warnings, material conflict warnings, size mismatch warnings, printer availability warnings, slot-overlap checks, due-date risk flags, and operator-attributed audit events for scheduling and queue changes
- Auto Todos workspace generated from task state, slicing needs, scheduling needs, material mismatch, build-volume mismatch, post-processing, due-date risk, printer availability, and exception conditions, with persisted claim, snooze, complete, and reopen actions
- Cloud slicer with API-backed slicer jobs, stored G-code output, file metadata updates, internal fallback G-code adapter, and optional external PrusaSlicer/OrcaSlicer/SuperSlicer command hook
- Filament spool inventory with API-backed add/edit, dry-storage toggles, usage logging, generated printable label sheets, scan-code lookup/usage logging, low-stock warnings, and color swatches
- API-backed profile manager for machine, process, and filament presets with Manual creation, Orca-style profile text import, Bambu-style JSON sync/import, update/archive actions, default profile selection for slicer jobs, persisted automatic matching policy, and stored settings metadata
- Analytics dashboard backed by `/api/analytics`, live summary cards, charts, material mix, success trend, and CSV export
- Print history backed by `/api/history`, API-backed issue notes, exception flags, reprint generation, and annotation audit events
- Maintenance dashboard with API-backed jobs, completion updates, reusable templates, issue reports that can generate maintenance jobs, schedules, inventory, and problem tracking
- Team users with API-backed invites, temporary passwords, admin password reset, password-reset-required indicators, role/location updates, owner-protection guardrails, permissions, and organization/location fields
- Signup-created workspace tenancy with schema-versioned workspace records, scoped state/list APIs, scoped users/API keys/settings/billing/export/audit reads, and workspace-tagged production objects for small-team SaaS isolation.
- Integrations, API-backed scoped API key creation/disable flow, endpoint-redacted API-backed webhook configuration, test delivery, production-event webhook delivery, and delivery log
- API-backed OctoPrint, Moonraker, and PrusaLink bridge configuration, key-safe and endpoint-redacted bridge listing, connection tests, manual sync, background polling sync, status broadcasting, and bridge-aware printer actions with persisted local state transitions
- Production background worker process for telemetry ticks and OctoPrint/Moonraker/PrusaLink polling, with durable worker heartbeat metadata and internal token-protected API rebroadcasts for WebSocket/SSE clients
- Authenticated WebSocket realtime channel for production state snapshots, events, heartbeats, telemetry ticks, bridge sync updates, and notification delivery updates, with the browser console using WebSocket first and SSE as a fallback
- Add-ons marketplace with commerce connectors, API-backed cost catalog, API-backed audit timeline with workspace and operator context for production, settings, onboarding, billing, API-key, user-management, and admin changes, CSV export, manual audit-retention enforcement, configurable MQTT event publishing, and mobile console toggles
- PWA mobile console assets with installable manifest, maskable SVG icon, production service worker registration, static app-shell caching, offline fallback page, and API network-only handling to avoid stale production data
- API-backed Sidebar Hot Drop workflow with persisted upload-only, direct-print, and auto-queue modes that can generate stored sample files, create queue jobs, route unsliced files to slicing, and trigger queue matching for printable files
- Notification center with endpoint-redacted API-backed Slack, Discord, custom webhook, and email-provider webhook channel configuration, test delivery, production-event delivery, and delivery log
- API-backed settings for organization, billing plan, real storage usage, units, currency, timezone, theme, user password change, two-factor auth setup, security policy with audit retention days and API key IP/CIDR allowlists, internal/external/Stripe billing sessions, Stripe webhook-synced subscriptions and invoices, admin JSON backup export, full file backup export, and safe restore preview/commit

## Current Integration Boundaries

- Printer hardware can be driven through OctoPrint, Moonraker, or PrusaLink bridges when configured; otherwise demo telemetry uses API timers in single-process mode or the Docker worker process in production-style deployments.
- API routes are real Fastify endpoints with schema-versioned JSON or SQLite-backed document persistence, automatic startup migrations, pre-migration backups, workspace/tenant scoping migrations, signup-created isolated workspaces, data-integrity reports, security headers, route-level throttling for sensitive actions, auth, TOTP two-factor challenges, production Owner bootstrap, optional default-user disabling, readiness checks, protected Prometheus-style metrics, role checks, scoped API key auth with optional IP/CIDR allowlist enforcement, Docker-ready static frontend/PWA serving, server-sent event streaming, WebSocket realtime state, backend telemetry ticks, worker broadcasts, multipart upload, model metadata extraction, parametric STL generation, generated sample STL storage, S3-compatible object storage, file folder persistence, stored file download/delete, full backup file-byte export/restore, spool label exports, spool scan-code usage logging, profile defaults, profile matching policy, maintenance templates, maintenance problem reports, billing/storage usage, plan management, optional Stripe checkout/portal/webhook subscription sync, cost catalog quote calculation, SKU catalog export, material mapping, audit log query/export, safe admin backup restore, and validation for printer creation, files, parts, SKUs, order-to-job dry-runs and commits, stock previews, duplicate generation blocking, queue creation, queue matching dry-runs, committed production starts, queue scheduling with warnings, automatic scheduling, material/color schedule batching, load-balance optimization, constraint-solver scheduling, schedule diagnostics, generated todo actions, queue status/priority, printer status, printer action state transitions, slicer jobs, slicing status, webhook delivery, notification channel delivery, analytics, print history annotations, reprint generation, admin exports, and derived todos.
- Some offline fallback paths still use local state for instant feedback when the local API is unavailable.
- OctoPrint, Klipper/Moonraker, and PrusaLink bridges can be configured, tested, manually synced, background-polled, broadcast to the realtime stream, and used for basic printer actions through the local API. Webhooks, notification channels, and the MQTT Event Stream add-on can be configured and delivered for matching production events. Commerce connectors can test and import JSON/CSV order feeds with stored bearer tokens hidden from the UI. Cloud-bridge and some marketplace integrations still have UI flows but do not transmit external data yet.

## Suggested Real Integrations Later

- For very large plants, swap the built-in `javascript-lp-solver` planner for a dedicated CP-SAT/OR-Tools worker with labor shifts, multi-day capacity calendars, and hundreds-to-thousands of queued jobs.
- Add a normalized Postgres schema with row-level security for larger multi-tenant scale beyond the current JSON/SQLite document-store tenancy.
- Add object-storage lifecycle policies, CDN downloads, malware scanning, and signed temporary download URLs for public-facing customer portals.
- Move long-running external slicer jobs into isolated worker containers when production farms need queued asynchronous slicing at scale.
- Add Stripe signature verification against raw webhook bodies if the deployment exposes webhooks directly to the public internet rather than through a trusted edge proxy that injects `x-layerpilot-billing-webhook-secret`.
- Add organization-level RBAC on the backend.

## Recommended GitHub topics

`print-farm`, `3d-printing`, `saas`, `self-hosted`, `manufacturing`, `production-planning`, `printer-tools`, `inventory-management`, `job-queue`, `docker`, `typescript`, `react`.
