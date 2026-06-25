# Operations Runbook

This runbook covers routine production operation for a 3DSTU FarmFlow VPS.

## Daily Checks

- Open the dashboard and review printer state, blocked jobs, due-risk work, and low inventory.
- Check `/api/readiness` or the ops-check timer result.
- Confirm the latest backup exists and was verified.
- Review failed webhook, notification, MQTT, commerce, and bridge delivery logs.
- Resolve generated todos for slicing, scheduling, material, maintenance, and exceptions.

In `NODE_ENV=production`, `/api/readiness` is a deployment gate, not just a liveness check. It fails if required owner credentials or worker/metrics tokens are missing, if documented default secrets are still in use, if production token/password minimum lengths are not met, or if default/demo access is still enabled.

`scripts/ubuntu-deploy.sh ops-check` also runs an authenticated API check when credentials are available from `.env`. It verifies login, `/api/state`, `/api/audit`, and `/api/metrics` when `LAYERPILOT_METRICS_TOKEN` is configured. Set `LAYERPILOT_OPS_EMAIL` and `LAYERPILOT_OPS_PASSWORD` to use a dedicated Owner/Admin smoke account; otherwise it falls back to the bootstrap admin credentials.

## Session Policy

- User bearer tokens are stored only as server-side hashes in persisted data.
- Sessions expire after `LAYERPILOT_SESSION_TTL_HOURS`, default `168` hours.
- Active sessions also expire after `LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS` without use, default `24` hours.
- Password changes keep only the current session; admin password resets revoke all sessions for the reset user.

## API Key Policy

- Create and update API keys only from a logged-in Owner/Admin user session.
- API keys cannot create, update, or rotate other API keys.
- API keys cannot be granted wildcard or account-management scopes.
- Grant only the automation scopes needed for the integration: `actions:write`, `admin:export`, `admin:restore`, `catalog:write`, `commerce:write`, `files:write`, `inventory:write`, `maintenance:write`, `metrics:read`, `notifications:write`, `orders:write`, `printers:control`, `queue:write`, or `webhooks:write`.
- API-key read access is scope-gated too. For example, `queue:write` keys can read queue-adjacent production resources but cannot read users, workspace settings, API keys, or audit logs.
- Use `admin:restore` keys only for restore dry-runs; destructive restore commits still require a user session.

## Order And Queue Handling

- Use dry-run job generation before committing SKU-linked orders.
- API clients and public quote forms that submit customer quote requests, accept/reject/request quote changes, create orders, convert quotes, queue work, send printer actions, create spools, log spool usage, create maintenance jobs/templates/reports, receive filament purchases, generate reorder plans, import commerce batches, create billing portal sessions, change billing plans, or trigger audit-retention runs should send a unique `Idempotency-Key` on retry-prone requests. Supported routes replay the original 2xx response for the same actor, key, route, and body, and return `409` if the same key is reused with different input. Printer action replays happen before bridge dispatch, preventing duplicate pause/resume/cancel commands during client retries. The built-in public quote form and customer quote portal controls already generate and reuse keys for the same attempted payload until the request succeeds.
- Idempotency replay records are retained only as internal server metadata. `/api/state` and `/api/admin/export` omit the ledger so replay response bodies from token-returning routes are not included in support or backup handoff files.
- Review `/api/audit` after core production changes; order, catalog, scheduling, queue, bridge, file-version, history/reprint, admin export, integrity, restore, and job-generation events include the workspace and authenticated operator context for traceability.
- Use Hold when an order should stop progressing but remain recoverable.
- Use Cancel when the customer or operator stops the order. Cancelled orders cascade to linked non-terminal generated jobs and release reserved filament.
- Use Complete only after all fulfillment work is done.
- Use queue job cancellation for single-job exceptions that should not cancel the whole order.

Idempotency is supported for:

- `POST /api/orders`
- `POST /api/actions`
- `POST /api/public/quoteRequests`
- `POST /api/public/quoteRequests/:id/decision`
- `POST /api/orders/:id/generate-jobs`
- `POST /api/quoteRequests/:id/convert-order`
- `POST /api/queue`
- `POST /api/spools`
- `POST /api/spools/scan`
- `POST /api/maintenance`
- `POST /api/maintenance/templates`
- `POST /api/maintenance/reports`
- `POST /api/productionTemplates/:id/run`
- `POST /api/purchaseRequests/reorderPlan`
- `POST /api/admin/audit-retention/run`
- `POST /api/billing/portal`
- `POST /api/purchaseRequests/:id/receive`
- `POST /api/commerceConnectors/:id/import`
- `POST /api/commerce/import-csv`
- `PATCH /api/billing/plan`
- `PATCH /api/orders/:id/status`
- `PATCH /api/spools/:id/usage`
- `PATCH /api/queue/:id/schedule`
- `PATCH /api/queue/:id/status`
- `PATCH /api/queue/:id/priority`

## Printer Bridges

- Test each bridge after credential or network changes.
- A failed diagnostic should move the printer to a safe offline state.
- API responses, shared state, admin exports, and delivery logs redact bridge base URL paths/query strings and API keys; operators should re-enter or verify bridge endpoints from the integration settings when rotating credentials.
- Do not expose printer bridge credentials or full endpoint URLs in support bundles or screenshots.
- Keep manual bridge mode for machines that cannot be controlled safely.

## Integration Endpoints

- Treat webhook, notification, commerce feed, and printer bridge URLs as credentials when they contain provider tokens in the path or query string.
- API list/state/export responses show only redacted endpoint host metadata plus `hasUrl` or `hasBaseUrl` flags.
- Stored endpoint URLs remain available server-side for deliveries, connector imports, and bridge commands, but operators should paste the full URL again when replacing or rotating an endpoint.
- Delivery logs redact endpoint paths and query strings; use provider-side logs for exact destination troubleshooting when needed.

## Backup And Restore

Create and verify a backup:

```bash
scripts/ubuntu-backup.sh backup
scripts/ubuntu-backup.sh list
```

Run a restore drill without touching production:

```bash
scripts/ubuntu-backup.sh restore-drill /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
```

Restore production only after confirming the target instance should be replaced:

```bash
scripts/ubuntu-backup.sh restore /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
```

The restore command creates a pre-restore safeguard archive unless `LAYERPILOT_PRE_RESTORE_BACKUP=false` is explicitly set.
Workspace restore previews may be run with a scoped `admin:restore` API key for automation drills, but committing a restore through `/api/admin/restore` requires a logged-in user session and `confirm: "RESTORE"`.
Workspace exports and shared state redact customer quote portal bearer tokens. Restored or migrated quote records receive fresh portal tokens automatically; operators should use the quote customer-link action to generate or rotate customer-facing URLs after a restore.
Workspace exports and shared state also redact credential-bearing integration endpoint paths/query strings for webhooks, notifications, commerce connectors, delivery logs, and printer bridges while preserving host hints and stored-server-side operation.
Workspace exports and shared state also omit internal idempotency replay records; retries after a restore should use fresh `Idempotency-Key` values.

## Updates And Rollback

Normal update:

```bash
scripts/ubuntu-deploy.sh update
```

Rollback:

```bash
scripts/ubuntu-deploy.sh rollback /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
```

After either operation, run readiness and smoke checks.

## Support Bundle

```bash
scripts/ubuntu-deploy.sh support-bundle
```

Review the generated archive before sharing it. The bundle redacts common secret names, and API support snapshots redact secret-like fields plus URL paths/query strings while preserving endpoint hosts, but operators remain responsible for checking customer-sensitive data.
