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

When the go-live check passes, it writes a sanitized evidence report to `release/go-live-evidence-*.md` by default. Set `LAYERPILOT_GO_LIVE_REPORT=/path/to/report.md` when the release handoff needs a fixed file path.

## Release Evidence

Record:

- The generated go-live evidence report.
- The release branch and commit from the report.
- Whether host QC or deploy were skipped in the report, and why that was intentional.
- The verified backup archive from the report and the operator responsible for rollback.
- Known blockers or customer-specific limits.

## Rollback Plan

Every release must have a verified backup before deployment. Use:

```bash
scripts/ubuntu-deploy.sh rollback /path/to/layerpilot-data-YYYYmmdd-HHMMSS.tgz
```

Rollback restores the selected volume backup, then runs readiness, smoke, and ops checks.
