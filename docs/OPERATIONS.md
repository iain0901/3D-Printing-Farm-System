# Operations Runbook

This runbook covers routine production operation for a 3DSTU FarmFlow VPS.

## Daily Checks

- Open the dashboard and review printer state, blocked jobs, due-risk work, and low inventory.
- Check `/api/readiness` or the ops-check timer result.
- Confirm the latest backup exists and was verified.
- Before trusting a file-byte backup or restore drill, run `/api/admin/integrity?checkStorage=true`, confirm `storage.complete` is true, and verify the `admin.integrity_checked` audit event records `checkStorage`, `storageComplete`, storage counts, and missing-file count.
- Review failed webhook, notification, MQTT, commerce, and bridge delivery logs.
- Resolve generated todos for slicing, scheduling, material, maintenance, and exceptions.

In `NODE_ENV=production`, `/api/readiness` is a deployment gate, not just a liveness check. It fails if required owner credentials or worker/metrics tokens are missing, if documented default secrets are still in use, if production token/password minimum lengths are not met, or if default/demo access is still enabled. It also fails when configured browser CORS origins are invalid, wildcarded, or not `http://`/`https://`; production CORS reflects only `LAYERPILOT_PUBLIC_URL` and explicit comma-separated `LAYERPILOT_CORS_ORIGINS`. It also fails when workspace API-key IP restrictions are enabled with an empty allowlist or a rule that is not an IPv4 address or IPv4 CIDR range. It also validates live optional dependency configuration: S3 object storage must include bucket, region, access key, and secret key when enabled; Stripe billing must include the secret, webhook secret, and all plan price IDs when Stripe is configured; MQTT must use an `mqtt://` or `mqtts://` URL with QoS `0`, `1`, or `2` and a boolean retain flag. When `LAYERPILOT_WORKER_TELEMETRY` or `LAYERPILOT_WORKER_BRIDGE_POLLING` is enabled, readiness also requires a recent durable `worker` heartbeat. If that check fails, inspect the `layerpilot-worker` service logs, the shared data volume, and the configured worker intervals before trusting telemetry or bridge polling.

Stripe billing webhooks on `/api/billing/webhook/stripe` verify the official `Stripe-Signature` header against `LAYERPILOT_STRIPE_WEBHOOK_SECRET` when Stripe calls the app directly. Deployments that terminate or transform webhook bodies at a trusted edge proxy can instead inject `x-layerpilot-billing-webhook-secret` with the same configured secret; do not expose that fallback header to arbitrary clients.

`scripts/ubuntu-deploy.sh ops-check` also runs an authenticated API check when credentials are available from `.env`. It verifies login, `/api/state`, `/api/audit`, storage-aware `/api/admin/integrity?checkStorage=true`, and `/api/metrics` when `LAYERPILOT_METRICS_TOKEN` is configured. The check fails if integrity errors exist or `storage.complete` is false, so backup/storage drift is caught by the timer before a restore drill depends on it; the corresponding audit event keeps compact storage coverage evidence for later review. Set `LAYERPILOT_OPS_EMAIL` and `LAYERPILOT_OPS_PASSWORD` to use a dedicated Owner/Admin smoke account; otherwise it falls back to the bootstrap admin credentials.

In production, send operational shared tokens only in headers. Metrics scrapers must use `x-layerpilot-metrics-token`, and worker-to-API broadcasts must use `x-layerpilot-worker-token`; token query parameters are accepted only outside production for local compatibility so secrets do not land in proxy or access-log URLs.

Public signup is closed by default in `NODE_ENV=production` so an exposed customer VPS cannot mint arbitrary new Owner workspaces. Keep `LAYERPILOT_ENABLE_PUBLIC_SIGNUP=false` for normal customer deployments; set it to `true` only for an intentional self-service SaaS registration flow, then confirm `/api/readiness` reports `production-public-signup` as explicitly enabled.

## Session Policy

- User bearer tokens are stored only as server-side hashes in persisted data.
- Sessions expire after `LAYERPILOT_SESSION_TTL_HOURS`, default `168` hours.
- Active sessions also expire after `LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS` without use, default `24` hours.
- Known accounts are temporarily locked after repeated password or 2FA failures. Defaults are `LAYERPILOT_AUTH_LOCK_THRESHOLD=5` and `LAYERPILOT_AUTH_LOCK_MINUTES=15`; locked login attempts return `423` with a retry window.
- Password changes keep only the current session; admin password resets revoke all sessions for the reset user.
- Use an Owner/Admin password reset to clear a legitimate user's lock immediately after verifying the account owner out-of-band.
- In `NODE_ENV=production`, Owner/Admin sessions are limited to identity, password, logout, and TOTP setup/enable endpoints while workspace `requireAdmin2fa` is enabled and the account has not enrolled two-factor authentication.
- In `NODE_ENV=production`, Owner/Admin users cannot disable TOTP while workspace `requireAdmin2fa` remains enabled. Disable that workspace policy first for a planned 2FA reset, then re-enable the policy after the account is remediated.
- Review `/api/audit` for successful login, logout, password-change, signup, and 2FA setup/enable/verify/disable events during access reviews or incident response. These events include workspace, user, actor, and session metadata where applicable, but do not store bearer tokens, passwords, TOTP secrets, or recovery codes.
- Review `auth.login_failed` and `auth.2fa_failed` events during lockout, brute-force, or suspected account-takeover investigations. Known-account failures include workspace/user context plus compact IP/user-agent hints; submitted passwords, TOTP codes, and recovery codes are never stored in the audit event.
- Review `auth.account_locked` and `auth.login_locked` events to distinguish accounts that crossed the lock threshold from attempts that were rejected during the lock window.

## API Key Policy

- Create and update API keys only from a logged-in Owner/Admin user session.
- API keys cannot create, update, or rotate other API keys.
- API keys cannot be granted wildcard or account-management scopes.
- Grant only the automation scopes needed for the integration: `actions:write`, `admin:export`, `admin:restore`, `catalog:write`, `commerce:write`, `files:write`, `inventory:write`, `maintenance:write`, `metrics:read`, `notifications:write`, `orders:write`, `printers:control`, `queue:write`, or `webhooks:write`.
- API-key read access is scope-gated too. For example, `queue:write` keys can read queue-adjacent production resources but cannot read users, workspace settings, API keys, or audit logs.
- Use `admin:restore` keys only for restore dry-runs; destructive restore commits still require a user session.
- When `restrictApiByIp` is enabled, keep `allowedApiIps` to explicit IPv4 addresses or IPv4 CIDR ranges such as `203.0.113.25` or `203.0.113.0/24`; invalid or empty allowlists are rejected on settings writes and fail production readiness if they already exist in persisted data.

## Order And Queue Handling

- Use dry-run job generation before committing SKU-linked orders.
- API clients and public quote forms that submit customer quote requests, accept/reject/request quote changes, update operator-reviewed quotes, generate or rotate quote portal links, create orders, convert quotes, queue work, commit queue matching, run scheduler automation, trigger telemetry ticks, create file folders, upload model files, create/delete/version file records, generate sample models, handle Hot Drops, generate parametric nameplates, run slicer jobs or quick file-slice actions, update generated todos, annotate or reprint from history, test webhooks, test notification channels, test/import commerce connectors, test/sync printer bridges, send printer actions, update direct printer status, configure printer capabilities, create/update/run production templates, create/update catalog parts, create/update SKUs, update cost catalog pricing, run catalog material mapping, create/import/update/default/archive slicer profiles, update profile matching policy, configure webhooks/notification channels/commerce connectors/add-ons/bridges, update workspace settings, update onboarding checklist steps, generate support snapshots, create/update API keys, invite/update users, reset user passwords, create or update spools, generate spool labels, log spool usage, create or update maintenance jobs/templates/reports, create or update purchase requests, receive filament purchases, generate reorder plans, create billing portal sessions, change billing plans, or trigger audit-retention runs should send a unique `Idempotency-Key` on retry-prone requests. Supported routes replay the original 2xx response for the same actor, key, route, and body, and return `409` if the same key is reused with different input. Queue matching replays avoid duplicate committed assignment events after a dropped operator response. Scheduler replays avoid duplicate auto/optimized/constraint scheduling events after a dropped response. Telemetry tick replays avoid double-advancing printer progress or prematurely completing jobs after a dropped API response. File folder replays avoid duplicate folder audit events after a dropped operator response. Multipart model upload replays avoid duplicate stored files, stored bytes, and upload audit events after a dropped browser/API response. File/model artifact replays avoid duplicate stored sample/model records, linked parametric catalog parts, duplicate Hot Drop queue jobs, and duplicate file-version audit events after a dropped operator response. Slicer replays avoid duplicate slicer job records, stored G-code artifacts, file-version increments, and slicer audit events after a dropped operator response. Todo action replays avoid duplicate claim, snooze, complete, or reopen records and duplicate todo audit events. History annotation replays avoid duplicate issue/waste audit events and prevent double-deducting spool inventory after a dropped operator response. History reprint replays avoid duplicate queue jobs, reprint todos, and `queue.reprint` audit events after a dropped operator response. Webhook, notification, and commerce connector test replays avoid duplicate external test calls, test events, and delivery logs after a dropped operator response. Bridge diagnostic and sync replays avoid repeated hardware status polling and duplicate bridge audit events after a dropped operator response. Printer action replays happen before bridge dispatch, preventing duplicate pause/resume/cancel commands during client retries. Direct printer status replays avoid duplicate `printer.status` audit events after operator/browser retries. Catalog/profile/template/printer configuration replays avoid duplicate setup records and duplicate setup audit events after dropped operator responses; production-template run replays avoid duplicate queue jobs and duplicate run audit events. Integration configuration replays avoid duplicate webhook, notification channel, commerce connector, add-on, and bridge records or setup audit events. Governance setup replays avoid duplicate settings, onboarding, and support snapshot audit events after dropped operator responses. Admin account replays avoid duplicate generated API keys, duplicate invites, repeated password rotation, and duplicate governance audit events after dropped owner/admin responses. Cost catalog and material-map replays avoid duplicate pricing or material-normalization audit/run records, and material-map events include workspace/operator context. Spool metadata, usage, scan, and label export replays avoid duplicate inventory audit events; label export retries return the original CSV/HTML artifact without duplicating `spool.labels_generated` audit events. Maintenance job update replays avoid duplicate maintenance audit events after operator/browser retries. Purchase-request create/update replays avoid duplicate reorder records and duplicate purchasing audit events after operator/browser retries. Quote update replays avoid duplicate quote update audit events after operator/browser retries. Quote portal-link rotation replays return the first generated URL and token instead of rotating again and invalidating the operator-visible link. The built-in public quote form, customer quote portal controls, daily operator controls for queue scheduling/status/priority/matching, scheduler automation, order creation/lifecycle/job generation, operator quote update/link/convert actions, file folder creation, model upload, file sample/version/delete/slice actions, Hot Drop, slicer jobs, production-template save/run controls, parametric nameplate generator, printer bridge actions, direct printer status controls, commerce connector test/import/CSV intake controls, spool creation/update/usage/scan/labels, maintenance job updates, generated todo actions, filament purchase requests/reorder/receive, Team page account controls, API-key controls, Settings page governance controls, support snapshot action, and billing actions already generate and reuse keys for the same attempted payload until the request succeeds.
- Idempotency replay records are retained only as internal server metadata. `/api/state` and `/api/admin/export` omit the ledger so replay response bodies from token-returning routes are not included in support or backup handoff files.
- Review `/api/audit` after core production changes; order, catalog, material mapping, scheduling, queue, bridge, file-create, file-download, file-preview, file-version, history/reprint, admin export, audit export, integrity, restore, job-generation, onboarding, support snapshot, settings, billing, add-on, cost catalog, API-key, and user-management events include the workspace and authenticated operator context for traceability. `file.created` events record file ID/name/type/material, status, version, and storage-backed status without file contents or storage locations. `file.downloaded` events record file ID/name/type, storage-backed versus fallback-manifest status, and byte count without file contents, local storage paths, or object-storage keys. `file.previewed` events record the same file identity and storage-backed context plus preview kind and byte count, also without file contents or storage locations. `catalog.exported` events record workspace-scoped catalog CSV row/object counts, and `admin.audit_exported` events record audit CSV filters plus matched/exported counts; neither stores the exported CSV body. Use `type`, `search`, `limit`, and `offset` on `/api/audit` and `/api/audit/export` when collecting filtered evidence; API responses report the raw total, matched total, returned count, and whether more matching records are available.
- Review inventory and maintenance audit events when investigating material drift, failed service work, or physical inventory exceptions. Spool creation, label export, scan/usage/update, purchase request creation/reorder/update/receive, maintenance job creation/update, maintenance templates, and problem reports include workspace and authenticated operator context.
- Review integration endpoint audit events after webhook, notification channel, or commerce feed changes. `webhook.created`, `webhook.updated`, `webhook.test`, `notification.channel_created`, `notification.channel_updated`, `notification.test`, `commerce.connector_created`, and `commerce.connector_updated` include workspace/operator context and compact endpoint metadata without storing endpoint URLs, URL paths/query strings, or bearer tokens.
- Manual audit-retention runs use the authenticated workspace's retention settings and prune only that workspace's non-protected events. Protected admin/system events remain preserved, and events from other workspaces are left intact.
- Use Hold when an order should stop progressing but remain recoverable.
- Use Cancel when the customer or operator stops the order. Cancelled orders cascade to linked non-terminal generated jobs and release reserved filament.
- Use Complete only after all fulfillment work is done.
- Use queue job cancellation for single-job exceptions that should not cancel the whole order.

Idempotency is supported for:

- `POST /api/orders`
- `POST /api/actions`
- `POST /api/file-folders`
- `POST /api/files`
- `POST /api/files/upload`
- `POST /api/files/sample`
- `POST /api/hot-drop`
- `POST /api/parametric/nameplate`
- `POST /api/printers`
- `PATCH /api/printers/:id`
- `PATCH /api/printers/:id/status`
- `PATCH /api/addons/:id`
- `POST /api/todos/:id/action`
- `PATCH /api/history/:id`
- `POST /api/history/:id/reprint`
- `POST /api/webhooks`
- `PATCH /api/webhooks/:id`
- `POST /api/webhooks/:id/test`
- `POST /api/notificationChannels`
- `PATCH /api/notificationChannels/:id`
- `POST /api/notificationChannels/:id/test`
- `POST /api/commerceConnectors`
- `PATCH /api/commerceConnectors/:id`
- `POST /api/bridges`
- `POST /api/apiKeys`
- `PATCH /api/apiKeys/:id`
- `POST /api/users`
- `PATCH /api/users/:id`
- `POST /api/users/:id/reset-password`
- `POST /api/bridges/sync`
- `POST /api/bridges/:id/test`
- `POST /api/printers/:id/sync`
- `POST /api/public/quoteRequests`
- `POST /api/public/quoteRequests/:id/decision`
- `PATCH /api/quoteRequests/:id`
- `POST /api/quoteRequests/:id/customer-link`
- `POST /api/orders/:id/generate-jobs`
- `POST /api/quoteRequests/:id/convert-order`
- `POST /api/queue`
- `POST /api/queue/match`
- `POST /api/schedule/auto`
- `POST /api/schedule/optimize`
- `POST /api/schedule/constraint`
- `POST /api/telemetry/tick`
- `POST /api/slicer/jobs`
- `POST /api/parts`
- `PATCH /api/parts/:id`
- `POST /api/skus`
- `PATCH /api/skus/:id`
- `POST /api/productionTemplates`
- `PATCH /api/productionTemplates/:id`
- `PATCH /api/costCatalog`
- `POST /api/catalog/material-map`
- `POST /api/spools`
- `POST /api/spools/labels`
- `POST /api/spools/scan`
- `PATCH /api/spools/:id`
- `POST /api/purchaseRequests`
- `PATCH /api/purchaseRequests/:id`
- `POST /api/maintenance`
- `PATCH /api/maintenance/:id`
- `POST /api/maintenance/templates`
- `POST /api/maintenance/reports`
- `POST /api/profiles`
- `POST /api/profiles/import`
- `PATCH /api/profiles/:id`
- `PATCH /api/profiles/:id/default`
- `PATCH /api/profile-policy`
- `DELETE /api/profiles/:id`
- `POST /api/productionTemplates/:id/run`
- `POST /api/purchaseRequests/reorderPlan`
- `POST /api/admin/audit-retention/run`
- `POST /api/support/snapshot`
- `POST /api/billing/portal`
- `POST /api/purchaseRequests/:id/receive`
- `POST /api/commerceConnectors/:id/import`
- `POST /api/commerceConnectors/:id/test`
- `POST /api/commerce/import-csv`
- `PATCH /api/billing/plan`
- `PATCH /api/workspaceSettings`
- `PATCH /api/onboarding/:id`
- `PATCH /api/orders/:id/status`
- `PATCH /api/files/:id/version`
- `PATCH /api/files/:id/slice`
- `DELETE /api/files/:id`
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
- For Stripe billing, configure Stripe to send signed webhooks to the app or keep the route behind a trusted proxy that injects `x-layerpilot-billing-webhook-secret`; unsigned public webhook traffic is rejected when `LAYERPILOT_STRIPE_WEBHOOK_SECRET` is set.
- API list/state/export responses show only redacted endpoint host metadata plus `hasUrl` or `hasBaseUrl` flags.
- Stored endpoint URLs remain available server-side for deliveries, connector imports, and bridge commands, but operators should paste the full URL again when replacing or rotating an endpoint.
- Delivery logs redact endpoint paths and query strings; use provider-side logs for exact destination troubleshooting when needed.
- Audit events for endpoint configuration and test sends identify the workspace, operator, endpoint record ID, enabled status, subscribed event names, token presence, and channel/connector type where applicable; they intentionally omit full URLs and tokens.

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
Confirmed restore commits accept an `Idempotency-Key`; if the success response is dropped, an exact retry can replay the original restored summary after the commit has revoked the old session. Restore previews remain authenticated dry-runs and are not replayed through the post-commit path.
Restore preview and commit summaries include `filePayloadCoverage` for stored model/G-code bytes: expected payload count, included payload count, missing payloads, extra payloads, and a `complete` flag. Treat missing payloads as a stop condition unless the volume/object storage is being restored separately or the operator intentionally accepts re-uploading those files after restore.
Admin integrity checks with `checkStorage=true` include a `storage` coverage block for current stored model/G-code bytes: expected payloads, present payloads, missing objects, total bytes, and whether coverage is complete. Use this before full JSON exports, volume backup verification, or restore drills so missing local/S3 file bytes are caught early; authenticated production smoke and ops-check runs now enforce the same storage coverage gate.
Workspace exports and shared state redact customer quote portal bearer tokens. Restored or migrated quote records receive fresh portal tokens automatically; operators should use the quote customer-link action to generate or rotate customer-facing URLs after a restore.
Workspace exports and shared state also redact credential-bearing integration endpoint paths/query strings for webhooks, notifications, commerce connectors, delivery logs, and printer bridges while preserving host hints and stored-server-side operation.
Workspace exports and shared state also omit internal idempotency replay records; retries after a restore should use fresh `Idempotency-Key` values.
`/api/admin/export?includeFiles=true` includes stored model/G-code bytes only when the preflight storage manifest is within `LAYERPILOT_FULL_BACKUP_MAX_BYTES` (default 512 MiB) and every referenced stored file can be read. Oversized full exports return `413` with file counts, total bytes, the limit, and missing-object details before any file bytes are embedded in JSON. Full exports with missing stored files return `409` by default so operators do not mistake a partial JSON export for a restorable full backup. Use `allowMissingFiles=true` only when the partial JSON export is intentional and the missing file bytes are covered by a separate volume/object-storage restore plan. For larger production farms, use `scripts/ubuntu-backup.sh backup` plus object-storage lifecycle/backups rather than raising the API JSON export limit casually.

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
