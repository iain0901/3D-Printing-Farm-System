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
- [ ] Admin and Owner users enroll TOTP when `requireAdmin2fa` is enabled.
- [ ] Session lifetime and idle timeout are set intentionally for the farm's device-sharing model.
- [ ] Operator accounts have only the permissions needed for daily production.
- [ ] API keys have the minimum required scopes.
- [ ] API keys use only grantable automation scopes and no wildcard, user-management, settings, or API-key-management scope.
- [ ] API keys are tested against their intended read endpoints and are blocked from unrelated UI/admin resources.
- [ ] API-key creation and rotation are performed from a logged-in Owner/Admin user session, not from another API key.
- [ ] API key IP/CIDR allowlists are enabled when automation runs from fixed networks.
- [ ] `/api/audit` shows recent production/admin events with the expected workspace and operator context, including scheduling, queue, bridge, file-version, and history/reprint changes.

## Production Workflows

- [ ] Orders can be created from manual entry, CSV, connector import, or quote conversion.
- [ ] SKU-linked orders can dry-run job generation before committing queue jobs.
- [ ] External clients and public quote forms use `Idempotency-Key` for retry-prone quote intake, customer quote decisions, quote portal-link generation/rotation, order, quote conversion, queue, scheduler automation, generated todo action, printer action, inventory, maintenance, filament purchasing, commerce import, billing, and audit-retention write APIs; scheduler retries have been smoke-tested so dropped responses do not duplicate auto/optimized/constraint scheduling audit events; generated todo action retries have been smoke-tested so they do not duplicate claim/snooze/complete/reopen records; quote portal-link rotation retries have been smoke-tested so they do not invalidate the first operator-visible customer link; printer action retries have been smoke-tested against bridge-connected hardware so client retries do not duplicate pause/resume/cancel commands; the built-in public quote form and quote portal controls have been smoke-tested for generated idempotency headers.
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
