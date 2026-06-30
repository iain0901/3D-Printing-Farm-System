# Release Candidate Status

Current working release branch:

```text
codex/production-saas-completion-20260624
```

The branch has reached release-candidate level for a deployable 3D printing farm SaaS platform. Core product work, deployment scripts, production-readiness checks, audit coverage, backup/restore flows, idempotency safety, and operator UI have been built and tested extensively.

## Current status in plain language

The software is no longer just an early mockup. It is a working release candidate that still needs real deployment choices before customer production.

## Go-live blockers are mostly external decisions

Before treating it as the official production instance, decide or provide:

- Final public domain
- Owner/Admin account credentials
- Real hardware bridge mode and printer endpoints
- Local storage versus S3-compatible object storage
- Stripe settings if billing is enabled
- MQTT settings if event streaming is enabled
- Backup/restore responsibility and storage destination
- Whether default/demo users are disabled for the target deployment

## Verification baseline

The repository includes:

- Build and test scripts
- Ubuntu deployment scripts
- Production smoke checks
- Deployment doctor checks
- Go-live evidence report generation
- Production readiness checklist
- Operations runbook

See:

- `CODEX_FINAL_REPORT.md`
- `CODEX_RUN_STATUS.md`
- `docs/PRODUCTION_READINESS.md`
- `docs/OPERATIONS.md`
- `docs/RELEASE.md`
