# Release Runbook

Use this process for every production release branch.

## Branch And QC

```bash
git status --short --branch
npm run qc
```

Do not commit or push a release candidate while QC is failing.

## Production Package

```bash
npm run package:ubuntu
```

The package task verifies required deployment files and excludes local databases, uploaded files, `.env`, build outputs, backups, support bundles, and `node_modules`.

## VPS Validation

On the target host:

```bash
scripts/ubuntu-deploy.sh doctor
scripts/ubuntu-go-live-check.sh
```

Set `LAYERPILOT_GO_LIVE_DEPLOY=true` only when the host and environment variables are ready for deployment.

## Release Evidence

Record:

- Git branch and commit SHA.
- `npm run qc` result.
- Deployment doctor result.
- Live smoke result.
- Backup archive path and restore-drill result.
- Known blockers or customer-specific limits.

## Rollback Plan

Every release must have a verified backup before deployment. Use:

```bash
scripts/ubuntu-deploy.sh rollback /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
```

Rollback restores the selected volume backup, then runs readiness, smoke, and ops checks.
