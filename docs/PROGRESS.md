# Production Readiness Progress

Last updated: 2026-06-25

## Estimate

Overall production-readiness estimate: **85% complete**.

This means the code and deployment tooling are close to production shape, but the project is not fully live-ready until it has been configured and validated on the target production host with real customer infrastructure.

## Completed Slices

- Docker and Ubuntu deployment path with API/web and worker services.
- Deployment doctor, readiness endpoint, production smoke script, authenticated ops-check flow, and go-live checker.
- Security headers, route-level rate limiting, session expiry and idle timeout controls.
- Production admin 2FA enforcement, including blocking protected Owner/Admin APIs until TOTP enrollment when the workspace requires it.
- API-key scope hardening and separation between user-session admin actions and automation keys.
- Tenant-aware and actor-aware audit context for production, governance, billing, support, restore, catalog, scheduling, bridge, queue, file, inventory, maintenance, purchasing, and account workflows.
- Redaction for support snapshots, admin exports, shared state, quote portal tokens, integration endpoints, delivery logs, and idempotency replay metadata.
- Retry-safe `Idempotency-Key` coverage across order, quote, queue, scheduler, file/model, slicer, todo, bridge, printer action, catalog/profile/printer configuration, governance, account, billing, inventory, maintenance, purchasing, commerce import, audit-retention, and restore-commit workflows.
- Browser-side idempotency headers for built-in public quote, customer portal, daily operator, governance, account, billing, support, restore, inventory, maintenance, and purchasing actions where backend semantics support replay.
- Backup helper, verified backup flow, restore drill path, pre-restore safeguard backup, rollback path, and support bundle generation.
- Public quote lifecycle, model upload handoff, quote portal links, validity windows, revision requests, quote conversion, and order lifecycle controls.
- Printer bridge diagnostics and controls for OctoPrint, Moonraker, PrusaLink, and manual bridge setups.
- Filament inventory reservation/deduction/release, spool labels, purchasing/reorder planning, maintenance workflows, file previews, production templates, and slicer job/file-slice flows.

## Active Work

- Implementation branch `codex/production-saas-completion-20260624` is continuing production-readiness hardening.
- Current active slice from the implementation status: live `/api/readiness` dependency-gate hardening for partial or invalid production S3, Stripe, and MQTT configuration.
- Documentation branch `codex/docs-progress-20260625` is tracking GitHub-facing status, go-live caveats, and progress while implementation continues.

## Remaining Go-Live Blockers

- Production host, `.env`, Docker Compose project, persistent volume, and backup destination must be configured for the target customer environment.
- Public domain, Nginx reverse proxy, WebSocket/SSE proxying, and TLS certificate must be installed and verified.
- Owner/Admin credentials, worker token, metrics token, session policy, default/demo access disabling, and optional integration secrets must be set with real production values.
- Real printer bridge validation must be performed against the actual printer fleet before live jobs are controlled by FarmFlow.
- Backup and restore drill must be run and accepted by the responsible operator.
- Live `/api/readiness`, `npm run smoke:prod`, `scripts/ubuntu-deploy.sh ops-check`, and `scripts/ubuntu-go-live-check.sh` results must pass on the production host.
- Customer-required Stripe, S3-compatible storage, MQTT, commerce feeds, webhook destinations, and notification channels must be configured and tested when they are part of the workflow.

## Next Documentation Steps

- Refresh this tracker after each substantial production-readiness implementation slice or at least once per working day while the branch is active.
- Keep README status short and link to this tracker instead of duplicating long operational checklists.
- Update `docs/PRODUCTION_READINESS.md` only when a gate changes.
- Update `docs/OPERATIONS.md` only when an operator action or runbook command changes.
- Add release notes after the implementation branch is stabilized and a versioned release candidate is selected.
