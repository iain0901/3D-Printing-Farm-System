# Production Readiness Checklist

Use this checklist before treating a 3DSTU FarmFlow instance as production.

## Required Gate

- [ ] `npm run qc` passes on the release branch.
- [ ] `scripts/ubuntu-deploy.sh doctor` passes on the target host.
- [ ] `LAYERPILOT_ADMIN_EMAIL` and `LAYERPILOT_ADMIN_PASSWORD` are set to real owner credentials.
- [ ] `LAYERPILOT_DISABLE_DEFAULT_USERS=true` and `LAYERPILOT_DISABLE_DEMO_LOGIN=true` are set for customer production.
- [ ] `LAYERPILOT_ENABLE_PUBLIC_SIGNUP=false` for customer VPS deployments, unless self-service tenant registration is intentionally exposed and monitored.
- [ ] `LAYERPILOT_WORKER_TOKEN` and `LAYERPILOT_METRICS_TOKEN` are unique strong values.
- [ ] Metrics scraping uses the `x-layerpilot-metrics-token` header and worker broadcasts use the `x-layerpilot-worker-token` header; production does not accept these shared tokens in URL query parameters.
- [ ] Browser CORS trusted origins are intentional: same-origin app/API deployments leave `LAYERPILOT_CORS_ORIGINS` blank, while separate quote portal or admin frontend domains are listed explicitly as `http://` or `https://` origins without wildcards.
- [ ] `.env` is not committed and is readable only by the deployment user.
- [ ] `/api/readiness` reports `ok: true`; in `NODE_ENV=production`, this also verifies required owner credentials, strong non-default worker/metrics tokens, disabled default/demo access, reports whether public signup is closed or explicitly enabled, validates production CORS trusted-origin configuration, validates API-key IP allowlist configuration when restrictions are enabled, checks consistent optional S3, Stripe, and MQTT dependency configuration, and requires a fresh worker heartbeat when `LAYERPILOT_WORKER_TELEMETRY` or `LAYERPILOT_WORKER_BRIDGE_POLLING` is enabled.
- [ ] `npm run smoke:prod` passes against the live URL.
- [ ] `scripts/ubuntu-deploy.sh ops-check` passes with authenticated state, audit, and metrics checks enabled through `LAYERPILOT_OPS_EMAIL`/`LAYERPILOT_OPS_PASSWORD` or the bootstrap admin credentials.
- [ ] Authenticated `npm run smoke:prod` and `scripts/ubuntu-deploy.sh ops-check` runs report storage-aware integrity with `storage.complete: true`, and `/api/audit` shows `admin.integrity_checked` metadata with `checkStorage: true` and `storageComplete: true`.

## Access Control

- [ ] At least one Owner account exists and can log in.
- [ ] Admin and Owner users enroll TOTP when `requireAdmin2fa` is enabled; in `NODE_ENV=production`, unenrolled Owner/Admin sessions are blocked from protected APIs until enrollment, and enrolled Owner/Admin users cannot disable TOTP while the workspace policy remains enabled.
- [ ] Session lifetime and idle timeout are set intentionally for the farm's device-sharing model.
- [ ] Account lockout/backoff settings are intentional for the deployment; defaults lock known accounts after 5 failed password or 2FA attempts for 15 minutes.
- [ ] Operator accounts have only the permissions needed for daily production.
- [ ] API keys have the minimum required scopes.
- [ ] API keys use only grantable automation scopes and no wildcard, user-management, settings, or API-key-management scope.
- [ ] API keys are tested against their intended read endpoints and are blocked from unrelated UI/admin resources.
- [ ] API-key creation and rotation are performed from a logged-in Owner/Admin user session, not from another API key.
- [ ] API key IP/CIDR allowlists are enabled when automation runs from fixed networks, and every rule is an explicit IPv4 address or IPv4 CIDR range; empty or invalid allowlists are rejected by settings writes and fail production readiness.
- [ ] `/api/audit` shows successful login, logout, password-change, signup, and 2FA setup/enable/verify/disable events with workspace, user, actor, and session metadata where applicable, and without bearer tokens, passwords, TOTP secrets, or recovery codes.
- [ ] Failed password and failed TOTP/recovery-code login attempts create `auth.login_failed` and `auth.2fa_failed` audit events with known workspace/user context and compact request metadata, but without submitted passwords, TOTP codes, or recovery codes.
- [ ] Repeated known-account authentication failures create `auth.account_locked` and `auth.login_locked` audit evidence, and Owner/Admin password reset has been verified as the immediate recovery path for legitimate locked users.
- [ ] `/api/audit` shows recent production/admin events with the expected workspace and operator context, including scheduling, queue, bridge, file-version, slicer job/file-slice, history annotation/reprint, onboarding, support snapshot, settings, billing, add-on, cost catalog, material mapping, API-key, and user-management changes; filtered audit review and CSV exports have been checked with `type`, `search`, `limit`, and `offset` so the matched count and `hasMore` metadata line up with operator evidence, and `admin.audit_exported` records the audit CSV export filters and counts without storing the exported CSV body.
- [ ] `/api/audit` shows quote, order, and catalog setup events with workspace/operator context for `quote_request.updated`, `quote_request.portal_link_generated`, `quote_request.portal_link_rotated`, `quote_request.converted`, `order.created`, `order.status`, `order.jobs_generated`, `part.created`, `part.updated`, `sku.created`, and `sku.updated`, without quote notes, portal bearer tokens, or full generated job response bodies.
- [ ] `/api/audit` shows printer setup and generated-file events with workspace/operator context for `printer.created`, `printer.updated`, `file_folder.created`, `file_folder.reused`, `file.sample_generated`, `hot_drop.handled`, and `parametric.generated`, without generated STL bodies, storage paths, object-storage keys, or printer credentials.
- [ ] `/api/audit` shows inventory and maintenance events with workspace and operator context for spool creation, label export, scan/usage/update, purchase request creation/reorder/update/receive, maintenance job creation/update, maintenance templates, and problem reports.
- [ ] `/api/audit` shows webhook, notification channel, and commerce connector configuration or test-send events with workspace/operator context and compact endpoint metadata, without endpoint URLs, URL paths/query strings, or bearer tokens.
- [ ] Audit-retention settings have been reviewed per workspace; manual retention runs prune only the authenticated workspace's non-protected events and preserve protected admin/system evidence.

## Production Workflows

- [ ] Orders can be created from manual entry, CSV, connector import, or quote conversion.
- [ ] SKU-linked orders can dry-run job generation before committing queue jobs.
- [ ] External clients and public quote forms use `Idempotency-Key` for retry-prone quote intake, customer quote decisions, operator quote updates, quote portal-link generation/rotation, order, quote conversion, queue, queue matching, scheduler automation, telemetry tick, file folder, multipart model upload, file/model artifact, slicer job/file-slice, generated todo action, history annotation/reprint, webhook test, notification test, commerce connector test/import, bridge diagnostic/sync, printer action, direct printer status, catalog/profile/template/printer configuration, production-template run, integration configuration, governance setup, admin account management, cost catalog, material mapping, inventory, maintenance, filament purchasing, billing, and audit-retention write APIs; queue schedule/status/priority retries have been smoke-tested so dropped responses do not duplicate lifecycle audit events or double-reserve, double-consume, or double-release spool inventory; order status retries have been smoke-tested so dropped responses do not duplicate `order.status` audit events, and cancelled-order retries do not double-release linked generated-job material reservations; queue matching retries have been smoke-tested so dropped responses do not duplicate committed assignment audit events; scheduler retries have been smoke-tested so dropped responses do not duplicate auto/optimized/constraint scheduling audit events; telemetry tick retries have been smoke-tested so dropped responses do not double-advance printer progress or prematurely complete jobs; file folder retries have been smoke-tested so folder creation/reuse responses replay without duplicate folder audit events; multipart model upload retries have been smoke-tested so stored files, stored bytes, and upload audit events are not duplicated; file/model artifact retries have been smoke-tested so generated sample models, parametric nameplates and linked catalog parts, Hot Drop queue jobs, and manual file-version bumps are not duplicated after dropped responses; production-template run retries have been smoke-tested so they do not duplicate queue jobs or run audit events; slicer retries have been smoke-tested so they do not duplicate slicer job records, stored G-code artifacts, file-version increments, or slicer audit events; generated todo action retries have been smoke-tested so they do not duplicate claim/snooze/complete/reopen records; history annotation retries have been smoke-tested so issue/waste updates do not double-deduct spool inventory or duplicate audit events; history reprint retries have been smoke-tested so they do not duplicate reprint queue jobs, todos, or audit events; webhook, notification, and commerce connector test retries have been smoke-tested so they do not duplicate external test calls, test events, or delivery logs; bridge diagnostic and sync retries have been smoke-tested so they do not repeat hardware status polling or duplicate bridge audit events; direct printer status retries have been smoke-tested so they do not duplicate `printer.status` audit events; catalog/profile/template/printer configuration retries have been smoke-tested so they do not duplicate setup records or setup audit events; integration configuration retries have been smoke-tested so they do not duplicate webhook, notification channel, commerce connector, add-on, or bridge records and audit events; governance setup retries have been smoke-tested so workspace settings, onboarding checklist updates, and support snapshot generation do not duplicate audit events; admin account retries have been smoke-tested so API-key create/update, user invite/update, and password reset retries do not rotate generated secrets again or duplicate governance audit events; cost catalog and material-map retries have been smoke-tested so they do not duplicate pricing or material-normalization audit/run records; inventory metadata, usage, scan, and label export retries have been smoke-tested so they do not duplicate inventory audit events, and label exports return the original CSV/HTML artifact without duplicate `spool.labels_generated` audit events; maintenance job update retries have been smoke-tested so they do not duplicate maintenance audit events; purchase-request create/update retries have been smoke-tested so they do not duplicate reorder records or purchasing audit events; operator quote update retries have been smoke-tested so they do not duplicate quote update audit events; quote portal-link rotation retries have been smoke-tested so they do not invalidate the first operator-visible customer link; printer action retries have been smoke-tested against bridge-connected hardware so client retries do not duplicate pause/resume/cancel commands; the built-in public quote form, quote portal controls, daily operator controls for queue scheduling/status/priority/matching, scheduler automation, order creation/lifecycle/job generation, operator quote update/link/convert actions, file folder creation, model upload, file sample/version/delete/slice actions, Hot Drop, slicer jobs, production-template save/run controls, parametric nameplate generator, printer bridge actions, direct printer status controls, commerce connector test/import/CSV intake controls, spool creation/update/usage/scan/labels, maintenance job updates, generated todo actions, filament purchase requests/reorder/receive, Team page account controls, API-key controls, Settings page governance controls, support snapshot action, and billing actions have been smoke-tested for generated idempotency headers.
- [ ] State/export handoff files have been checked to confirm internal idempotency replay records are omitted.
- [ ] Catalog CSV exports have been smoke-tested from the intended workspace, and `/api/audit` shows `catalog.exported` row/object counts without exported CSV contents or another workspace's SKUs.
- [ ] Operator quote review, portal-link generation/rotation, quote conversion, order lifecycle, SKU-linked job generation, and part/SKU setup audit records have been reviewed after a smoke run to confirm they include the expected operator and compact business identifiers.
- [ ] Cancelled orders stop linked active generated jobs and release material reservations.
- [ ] Queue jobs can be scheduled, started, paused, completed, failed, or cancelled.
- [ ] Spool inventory shows remaining, reserved, and available material.
- [ ] Maintenance templates and problem reports are configured for the fleet.
- [ ] Hardware bridges are tested for every connected printer before live work.
- [ ] Webhook, notification, commerce connector, and bridge endpoints are stored only in the intended production instance; exported/shared API responses redact credential-bearing URL paths and query strings.
- [ ] Webhook and notification test sends have been reviewed in `/api/audit` to confirm the operator, endpoint record ID, enabled status, and subscribed event names are present without storing the outbound URL or token.

## Data And Recovery

- [ ] Persistent data is stored in the Docker volume or configured database path.
- [ ] Local uploaded model storage or S3-compatible storage is configured intentionally.
- [ ] If S3 object storage is enabled, live `/api/readiness` passes with bucket, region, access key, and secret key configured.
- [ ] `/api/admin/integrity?checkStorage=true` reports `storage.complete: true` before relying on a file-byte backup or restore drill, and its audit event records storage expected/present counts, total bytes, and missing-file count.
- [ ] `scripts/ubuntu-backup.sh backup` creates a verified archive.
- [ ] `scripts/ubuntu-backup.sh restore-drill <archive>` succeeds without touching production data.
- [ ] Full API JSON file-byte exports are below `LAYERPILOT_FULL_BACKUP_MAX_BYTES`, return no missing stored-file payloads, or are intentionally replaced by verified volume/object-storage backups for large file libraries.
- [ ] Direct file creation plus model/G-code download and preview access are reviewed through `file.created`, `file.downloaded`, and `file.previewed` audit events; events include file identity and storage-backed context without storing file contents, local storage paths, or object-storage keys.
- [ ] Slicer jobs and quick file-slice actions are reviewed through `slicer.completed`, `slicer.failed`, and `file.sliced` audit events; events include operator, slicer job, file, printer/profile, engine, material settings, status, and output-size metadata without generated G-code bodies, slicer command arguments, local output/config paths, or object-storage keys.
- [ ] Slicer profile and production-template configuration changes are reviewed through `profile.created`, `profile.imported`, `profile.updated`, `profile.default_set`, `profile.policy_updated`, `profile.archived`, `production_template.created`, `production_template.updated`, and `production_template.run` audit events; events include operator, profile/template IDs, profile kind/source/target, file/printer/material/quantity/priority, policy flags, and generated-job counts without full profile settings, template notes, or generated queue response bodies.
- [ ] Generated sample models, Hot Drop uploads/queueing, and parametric nameplates are reviewed through `file.sample_generated`, `hot_drop.handled`, and `parametric.generated` audit events; events include compact file/job/part/material/byte metadata without generated model bodies or storage locations.
- [ ] Any `/api/admin/export?includeFiles=true&allowMissingFiles=true` use is documented as a partial JSON export with a separate file-byte recovery plan.
- [ ] `/api/admin/restore` preview `filePayloadCoverage.complete` is true for JSON backups that are expected to restore stored model/G-code bytes, or missing payloads are covered by a separate verified volume/object-storage restore plan.
- [ ] `/api/admin/restore` dry-run automation is scoped with `admin:restore`, and destructive restore commits are performed only from a logged-in Owner/Admin session.
- [ ] Destructive `/api/admin/restore` commits are submitted with an `Idempotency-Key`, and an exact retry has been smoke-tested to replay the restored summary after the successful commit revokes the original session.
- [ ] Customer quote portal links are regenerated or rotated after restore when needed; workspace exports redact portal bearer tokens and record only whether one exists.
- [ ] Retry clients use fresh `Idempotency-Key` values after restore because exported backups do not include internal replay records.
- [ ] Integration endpoint URLs are re-entered or verified after restore/rotation when provider tokens changed; exports show only redacted host metadata and `hasUrl`/`hasBaseUrl` flags.
- [ ] `layerpilot-backup.timer` is enabled on Ubuntu production hosts.
- [ ] Restore and rollback responsibility is assigned to a named operator.

## Monitoring And Operations

- [ ] Nginx or equivalent reverse proxy terminates HTTPS.
- [ ] WebSocket and SSE proxy headers are configured.
- [ ] `layerpilot-ops-check.timer` is enabled or an equivalent monitor is configured.
- [ ] If background telemetry or bridge polling is enabled, `/api/readiness` includes a passing `worker` check and the `layerpilot-worker` container or service has reported within the readiness freshness window.
- [ ] `/api/metrics` is scraped with a metrics token or scoped API key.
- [ ] If Stripe billing or MQTT event streaming is enabled, live `/api/readiness` passes with complete Stripe secret/webhook/price IDs and valid MQTT URL/QoS/retain settings.
- [ ] Stripe billing webhooks have been smoke-tested with a valid `Stripe-Signature` header, or the route is reachable only through a trusted edge proxy that injects `x-layerpilot-billing-webhook-secret`.
- [ ] Disk free space is monitored for the data volume and backup destination.
- [ ] Support bundle and API support snapshot generation are tested and reviewed for redaction; snapshots preserve endpoint hosts but remove secret-like fields and URL paths/query strings.

## Known Release Blockers

- Missing production domain or TLS certificate.
- Missing owner/admin credentials or weak production tokens.
- No verified backup and restore drill.
- Hardware bridges not validated against the actual printer fleet.
- External integrations such as Stripe, S3, MQTT, or commerce feeds not configured when required by the customer workflow.
