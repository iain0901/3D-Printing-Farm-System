# Deployment and Go Live

FarmFlow includes deployment assets for Ubuntu 22.04/24.04 and Docker Compose.

## Fresh Ubuntu deployment

```bash
chmod +x scripts/ubuntu-deploy.sh
LAYERPILOT_ADMIN_EMAIL=owner@example.com \
LAYERPILOT_ADMIN_PASSWORD='replace-with-a-long-password' \
LAYERPILOT_WORKSPACE_NAME='My Print Farm' \
scripts/ubuntu-deploy.sh deploy
```

For public HTTPS deployment, use the Ubuntu deployment guide in the repository:

- `docs/INSTALL.md`
- `deploy/ubuntu/README.md`

## Production environment decisions

Before a real go-live, decide or provide:

| Item | Why it matters |
|---|---|
| Public domain | Needed for HTTPS, links, smoke checks, and CORS origin policy |
| Owner account | First real admin/owner credential for the customer instance |
| Hardware bridge | OctoPrint, Moonraker, PrusaLink, or manual operating mode per printer |
| Storage | Local volume or S3-compatible object storage for model/G-code payloads |
| Billing | Stripe configuration if subscription or checkout flows are enabled |
| MQTT | Broker URL and credentials if event streaming is enabled |
| Backup target | Where verified backups and restore-drill evidence are stored |

## Go-live checks

Run the go-live script on the target host:

```bash
scripts/ubuntu-go-live-check.sh
```

A successful run creates a sanitized report under:

```text
release/go-live-evidence-*.md
```

The report is intended for release handoff. It should omit secrets and private environment-file paths.

## Required production gates

See `docs/PRODUCTION_READINESS.md` for the full checklist. Key gates include:

- `npm run qc` passes on the release branch
- Deployment doctor passes on the target host
- Real Owner credentials are configured
- Default/demo users are disabled for customer production
- Strong worker and metrics tokens are configured
- `/api/readiness` reports `ok: true`
- Authenticated smoke check passes against the live URL
- Backup and restore drill are verified
- Hardware bridges are tested against the actual printer fleet
