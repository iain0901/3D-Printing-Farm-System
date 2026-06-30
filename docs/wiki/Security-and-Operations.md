# Security and Operations

FarmFlow includes production-readiness controls because print-farm systems hold customer files, production history, operator actions, and sometimes payment or integration credentials.

## Access control

Recommended production setup:

- Create at least one real Owner account
- Disable default/demo access for customer production
- Use Admin/Operator/Viewer roles instead of shared passwords
- Enable 2FA for Owner/Admin users where possible
- Rotate API keys and grant minimum required scopes
- Restrict API keys by IP/CIDR when automation runs from fixed networks

## Audit trail

The API records audit events for important operational actions, including:

- Auth and 2FA activity
- Scheduling and queue lifecycle changes
- File creation, preview, download, slicing, and deletion
- Printer bridge setup, diagnostics, syncs, and printer actions
- Inventory, purchase request, maintenance, and problem-report events
- Quote, order, SKU, commerce, webhook, notification, and billing actions
- Admin export, restore, integrity, and support snapshot events

Audit metadata is designed to preserve operational evidence without storing raw secrets, passwords, tokens, generated G-code bodies, storage paths, or credential-bearing URLs.

## Backup and restore

Production operators should verify:

- Persistent data is stored in the intended Docker volume or configured DB path
- File storage is either local volume-backed or S3-compatible and intentionally configured
- `/api/admin/integrity?checkStorage=true` reports complete storage coverage
- Verified backups can be created
- Restore drills succeed before production data is trusted
- Destructive restore commits are performed only by logged-in Owner/Admin users

## Monitoring

Production deployments should monitor:

- `/api/health`
- `/api/readiness`
- `/api/metrics` with the metrics token header
- Background worker heartbeat if telemetry or bridge polling is enabled
- Disk space for the data volume and backup destination
- Nginx/HTTPS certificate status
- WebSocket/SSE proxy behavior

## Integrations

Optional integrations should be either fully configured or intentionally disabled:

- S3-compatible object storage
- Stripe billing and webhooks
- MQTT event stream
- Webhooks and notification channels
- Commerce connectors
- Hardware bridges
