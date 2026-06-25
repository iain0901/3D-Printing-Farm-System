# Production Readiness Checklist

Use this checklist before treating a 3DSTU FarmFlow instance as production.

## Required Gate

- [ ] `npm run qc` passes on the release branch.
- [ ] `scripts/ubuntu-deploy.sh doctor` passes on the target host.
- [ ] `LAYERPILOT_ADMIN_EMAIL` and `LAYERPILOT_ADMIN_PASSWORD` are set to real owner credentials.
- [ ] `LAYERPILOT_DISABLE_DEFAULT_USERS=true` and `LAYERPILOT_DISABLE_DEMO_LOGIN=true` are set for customer production.
- [ ] `LAYERPILOT_WORKER_TOKEN` and `LAYERPILOT_METRICS_TOKEN` are unique strong values.
- [ ] `.env` is not committed and is readable only by the deployment user.
- [ ] `/api/readiness` reports `ok: true`; in `NODE_ENV=production`, this also verifies required owner credentials, strong non-default worker/metrics tokens, and disabled default/demo access.
- [ ] `npm run smoke:prod` passes against the live URL.
- [ ] `scripts/ubuntu-deploy.sh ops-check` passes with authenticated state, audit, and metrics checks enabled through `LAYERPILOT_OPS_EMAIL`/`LAYERPILOT_OPS_PASSWORD` or the bootstrap admin credentials.

## Access Control

- [ ] At least one Owner account exists and can log in.
- [ ] Admin and Owner users enroll TOTP when `requireAdmin2fa` is enabled; in `NODE_ENV=production`, unenrolled Owner/Admin sessions are blocked from protected APIs until enrollment.
- [ ] Session lifetime and idle timeout are set intentionally for the farm's device-sharing model.
- [ ] Operator accounts have only the permissions needed for daily production.
- [ ] API keys have the minimum required scopes.
- [ ] API keys use only grantable automation scopes and no wildcard, user-management, settings, or API-key-management scope.
- [ ] API keys are tested against their intended read endpoints and are blocked from unrelated UI/admin resources.
- [ ] API-key creation and rotation are performed from a logged-in Owner/Admin user session, not from another API key.
- [ ] API key IP/CIDR allowlists are enabled when automation runs from fixed networks.
- [ ] `/api/audit` shows recent production/admin events with the expected workspace and operator context, including scheduling, queue, bridge, file-version, history annotation/reprint, onboarding, support snapshot, settings, billing, add-on, cost catalog, material mapping, API-key, and user-management changes.

## Production Workflows

- [ ] Orders can be created from manual entry, CSV, connector import, or quote conversion.
- [ ] SKU-linked orders can dry-run job generation before committing queue jobs.
- [ ] External clients and public quote forms use `Idempotency-Key` for retry-prone quote intake, customer quote decisions, operator quote updates, quote portal-link generation/rotation, order, quote conversion, queue, queue matching, scheduler automation, file/model artifact, slicer job/file-slice, generated todo action, history annotation/reprint, webhook test, notification test, bridge diagnostic/sync, printer action, catalog/profile/printer configuration, integration configuration, governance setup, admin account management, cost catalog, material mapping, inventory, maintenance, filament purchasing, commerce import, billing, and audit-retention write APIs; queue matching retries have been smoke-tested so dropped responses do not duplicate committed assignment audit events; scheduler retries have been smoke-tested so dropped responses do not duplicate auto/optimized/constraint scheduling audit events; file/model artifact retries have been smoke-tested so generated sample models, Hot Drop queue jobs, and manual file-version bumps are not duplicated after dropped responses; slicer retries have been smoke-tested so they do not duplicate slicer job records, stored G-code artifacts, file-version increments, or slicer audit events; generated todo action retries have been smoke-tested so they do not duplicate claim/snooze/complete/reopen records; history annotation retries have been smoke-tested so issue/waste updates do not double-deduct spool inventory or duplicate audit events; history reprint retries have been smoke-tested so they do not duplicate reprint queue jobs, todos, or audit events; webhook and notification test retries have been smoke-tested so they do not duplicate external test calls, test events, or delivery logs; bridge diagnostic and sync retries have been smoke-tested so they do not repeat hardware status polling or duplicate bridge audit events; catalog/profile/template/printer configuration retries have been smoke-tested so they do not duplicate setup records or setup audit events; integration configuration retries have been smoke-tested so they do not duplicate webhook, notification channel, commerce connector, add-on, or bridge records and audit events; governance setup retries have been smoke-tested so workspace settings, onboarding checklist updates, and support snapshot generation do not duplicate audit events; admin account retries have been smoke-tested so API-key create/update, user invite/update, and password reset retries do not rotate generated secrets again or duplicate governance audit events; cost catalog and material-map retries have been smoke-tested so they do not duplicate pricing or material-normalization audit/run records; inventory label export retries have been smoke-tested so they return the original CSV/HTML artifact without duplicate `spool.labels_generated` audit events; purchase-request create/update retries have been smoke-tested so they do not duplicate reorder records or purchasing audit events; operator quote update retries have been smoke-tested so they do not duplicate quote update audit events; quote portal-link rotation retries have been smoke-tested so they do not invalidate the first operator-visible customer link; printer action retries have been smoke-tested against bridge-connected hardware so client retries do not duplicate pause/resume/cancel commands; the built-in public quote form, quote portal controls, daily operator controls for queue scheduling/status/priority/matching, scheduler automation, order creation/lifecycle/job generation, operator quote update/link/convert actions, file sample/version/delete/slice actions, Hot Drop, slicer jobs, printer bridge actions, spool creation/usage/scan/labels, generated todo actions, filament purchase requests/reorder/receive, Team page account controls, API-key controls, Settings page governance controls, support snapshot action, and billing actions have been smoke-tested for generated idempotency headers.
- [ ] State/export handoff files have been checked to confirm internal idempotency replay records are omitted.
- [ ] Cancelled orders stop linked active generated jobs and release material reservations.
- [ ] Queue jobs can be scheduled, started, paused, completed, failed, or cancelled.
- [ ] Spool inventory shows remaining, reserved, and available material.
- [ ] Maintenance templates and problem reports are configured for the fleet.
- [ ] Hardware bridges are tested for every connected printer before live work.
- [ ] Webhook, notification, commerce connector, and bridge endpoints are stored only in the intended production instance; exported/shared API responses redact credential-bearing URL paths and query strings.

## Data And Recovery

- [ ] Persistent data is stored in the Docker volume or configured database path.
- [ ] Local uploaded model storage or S3-compatible storage is configured intentionally.
- [ ] `scripts/ubuntu-backup.sh backup` creates a verified archive.
- [ ] `scripts/ubuntu-backup.sh restore-drill <archive>` succeeds without touching production data.
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
- [ ] `/api/metrics` is scraped with a metrics token or scoped API key.
- [ ] Disk free space is monitored for the data volume and backup destination.
- [ ] Support bundle and API support snapshot generation are tested and reviewed for redaction; snapshots preserve endpoint hosts but remove secret-like fields and URL paths/query strings.

## Known Release Blockers

- Missing production domain or TLS certificate.
- Missing owner/admin credentials or weak production tokens.
- No verified backup and restore drill.
- Hardware bridges not validated against the actual printer fleet.
- External integrations such as Stripe, S3, MQTT, or commerce feeds not configured when required by the customer workflow.
