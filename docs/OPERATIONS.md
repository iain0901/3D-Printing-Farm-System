# Operations Runbook

This runbook is for operators running a live 3DSTU FarmFlow instance.

## Daily Checks

- Open `/api/readiness` and confirm database, storage, integrity, and worker checks are green.
- Review dashboard due-risk cards, printer errors, and generated todos.
- Confirm backup timer or external backup job completed.
- Check disk space before large file uploads.

## Release Checklist

1. Pull or apply the release on the VPS.
2. Bump the version number.
3. Run `npm run qc` in the project container or host environment.
4. Run `docker compose up --build -d`.
5. Confirm `docker compose ps` shows healthy services.
6. Confirm `/api/health`, `/api/readiness`, public homepage, static assets, and login.
7. Commit and push to GitHub.

## Backup And Restore

- Use `scripts/ubuntu-backup.sh backup` before manual maintenance.
- Use `scripts/ubuntu-backup.sh restore-drill <archive.tgz>` to test restore safety.
- Use `scripts/ubuntu-deploy.sh rollback <archive.tgz>` for production rollback.

## Support

For professional installation, training, custom integration, or technical support, contact support@3dstu.com.
