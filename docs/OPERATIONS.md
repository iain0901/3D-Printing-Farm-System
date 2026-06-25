# Operations Runbook

This runbook covers routine production operation for a 3DSTU FarmFlow VPS.

## Daily Checks

- Open the dashboard and review printer state, blocked jobs, due-risk work, and low inventory.
- Check `/api/readiness` or the ops-check timer result.
- Confirm the latest backup exists and was verified.
- Review failed webhook, notification, MQTT, commerce, and bridge delivery logs.
- Resolve generated todos for slicing, scheduling, material, maintenance, and exceptions.

## Session Policy

- User bearer tokens are stored only as server-side hashes in persisted data.
- Sessions expire after `LAYERPILOT_SESSION_TTL_HOURS`, default `168` hours.
- Active sessions also expire after `LAYERPILOT_SESSION_IDLE_TIMEOUT_HOURS` without use, default `24` hours.
- Password changes keep only the current session; admin password resets revoke all sessions for the reset user.

## Order And Queue Handling

- Use dry-run job generation before committing SKU-linked orders.
- API clients that create orders or queue work should send a unique `Idempotency-Key` on retry-prone requests. Supported routes replay the original 2xx response for the same actor, key, route, and body, and return `409` if the same key is reused with different input.
- Review `/api/audit` after core production changes; order, catalog, admin export, integrity, restore, and job-generation events include the workspace and authenticated operator context for traceability.
- Use Hold when an order should stop progressing but remain recoverable.
- Use Cancel when the customer or operator stops the order. Cancelled orders cascade to linked non-terminal generated jobs and release reserved filament.
- Use Complete only after all fulfillment work is done.
- Use queue job cancellation for single-job exceptions that should not cancel the whole order.

Idempotency is supported for:

- `POST /api/orders`
- `POST /api/orders/:id/generate-jobs`
- `POST /api/queue`
- `POST /api/productionTemplates/:id/run`
- `PATCH /api/orders/:id/status`
- `PATCH /api/queue/:id/schedule`
- `PATCH /api/queue/:id/status`
- `PATCH /api/queue/:id/priority`

## Printer Bridges

- Test each bridge after credential or network changes.
- A failed diagnostic should move the printer to a safe offline state.
- Do not expose printer bridge credentials in support bundles or screenshots.
- Keep manual bridge mode for machines that cannot be controlled safely.

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

Review the generated archive before sharing it. The bundle redacts common secret names, but operators remain responsible for checking customer-sensitive data.
