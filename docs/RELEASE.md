# Release Runbook

This project uses a simple release discipline: every production deployment gets a version bump, a Git commit, GitHub CI evidence, VPS QC evidence, and a public smoke check.

## Release Checklist

1. Update `package.json`, `package-lock.json`, and `docs/ROADMAP.md` with the new version.
2. Run the full QC suite:

```bash
npm run qc
```

3. Confirm GitHub Actions passes on `main`.
4. On the VPS, deploy from `/opt/layerpilot`:

```bash
scripts/ubuntu-deploy.sh update
```

5. Confirm readiness and public smoke checks:

```bash
curl -fsS http://127.0.0.1:8797/api/readiness
curl -fsS https://farm-saas.3dstu.com/api/health
```

6. Confirm the production bundle contains the expected version marker shown in the global footer.
7. Commit and push the release:

```bash
git add .
git commit -m "Release vX.Y.Z"
git push origin main
```

## GitHub CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request. It installs dependencies with `npm ci`, runs `npm run qc`, and stores the production `dist` folder as a short-retention artifact when available.

The CI job is intentionally read-only. It does not contain VPS secrets, deployment keys, or production credentials. Production deploys remain controlled from the VPS release path.

## VPS Deployment Notes

The VPS source of truth is `/opt/layerpilot`. Normal releases should use the built-in Ubuntu deployment script because it runs preflight checks, creates a verified backup, rebuilds Docker Compose services, waits for readiness, and runs smoke checks.

Use rollback only with a known-good backup archive:

```bash
scripts/ubuntu-deploy.sh rollback /path/to/layerpilot-backup.tgz
```

## Evidence To Keep

For each release, keep these facts in the handoff or release note:

- Version number
- Git commit SHA
- GitHub CI result
- VPS QC result
- Docker container health
- `/api/readiness` result
- Public `/api/health` result
- Smoke checks that prove the new UI/API path is present
