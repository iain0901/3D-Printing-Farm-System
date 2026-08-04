# Unified 3DRFM / FarmFlow Integration Traceability

## Purpose

This document is the current engineering traceability record for the unified 3D-printing quote, customer, and production system. It records the confirmed product decisions, the maintained implementation locations, and the automated evidence that proves the local build. It does not contain deployment secrets or customer conversation transcripts.

## Confirmed architecture

- One maintained codebase and one Vue 2 / Rspack frontend: `frontend-vue/`.
- One Fastify API and PostgreSQL persistence deployment, with an independently pinned OrcaSlicer worker.
- Chatwoot remains the source of truth for LINE conversations. The application stores only case linkage and operational events, never conversation transcripts.
- Customer-facing quote and case views expose only the final total; internal staff retain breakdown detail.
- Subscription SaaS billing is disabled for the self-managed workflow. Payments are handled as case payment records.

## Requirement evidence

| Confirmed decision | Implementation | Automated evidence |
|---|---|---|
| Single maintained system rather than separate customer and farm applications | Root scripts delegate to `frontend-vue`; Docker builds only the Vue frontend; legacy root React/PWA assets are absent | `api/deploy.test.mjs`, `api/pwa-assets.test.mjs` |
| Customer wizard supports quick estimate and specialist-assisted work in the same case | Public case intake and estimate endpoints in `api/cases-module.mjs`; customer views in `frontend-vue/src/views/portal/` | `api/cases-module.test.mjs` |
| Model and no-model requests share one case lifecycle | Case intake supports `hasModel`, multipart file storage, modeling requirements, parts, and technical-review flags | `api/cases-module.test.mjs`, `api/model-metadata.test.mjs` |
| Formal quote versions are immutable, default to seven days, and show only total to customers | `createQuoteVersion` and `publicQuoteVersion` in `api/case-domain.mjs` | `api/cases-module.test.mjs` |
| Manual payment is the first production payment flow | Case payment records in `api/cases-module.mjs`; payment/delivery workbench in `frontend-vue/src/views/cases/` | `api/cases-module.test.mjs` |
| OrcaSlicer runs separately and G-code requires approval before production | `orca-worker` Compose service, `deploy/orcaslicer/`, and case Orca routes | `api/orca-worker.test.mjs`, `api/cases-module.test.mjs`, Compose PostgreSQL smoke CI job |
| Scheduling is suggested by the system and confirmed by a specialist | Case scheduling suggestion and confirmation routes | `api/cases-module.test.mjs` |
| Print attempts, QC, delivery, and after-sales stay linked to the original case | Case lifecycle routes plus production workbench | `api/cases-module.test.mjs` |
| Customer cancellation is handled by a specialist through Chatwoot/LINE | Unified case decision APIs accept only `accepted` and `revision`; customer UI directs cancellation to Chatwoot | `api/cases-module.test.mjs` |
| Chatwoot owns all dialogue while staff can create/view a related case from the conversation | Signed panel context, linked-case creation, duplicate prevention, and notification routes in `api/chatwoot-module.mjs`; panel in `deploy/chatwoot-panel/` | `api/chatwoot-panel.test.mjs` |
| AI answers through Chatwoot with team-maintained knowledge and human handoff modes | `api/ai-engine.mjs`, `api/ai-knowledge.mjs`, `frontend-vue/src/views/ai-knowledge/` | `api/ai-engine.test.mjs`, `api/ai-knowledge.test.mjs` |
| Customer history, address book, coupons, loyalty points, and order tracking are available in the customer portal | Customer API routes and `frontend-vue/src/views/portal/Dashboard.vue` | `api/server.test.mjs`, `api/cases-module.test.mjs` |
| Full-system data is persisted with backup/restore support | PostgreSQL adapter, admin export/restore APIs, and Ubuntu release tooling | `api/persistence.test.mjs`, `api/server.test.mjs`, `api/deploy.test.mjs` |

## Local verification baseline

Run from the repository root:

```bash
npm ci
npm run install:frontend
npm run qc
npm run package:ubuntu
```

The latest local baseline is 17 passing test files and 195 passing tests. GitHub Actions verifies both the production Vue build/test job and the Docker Compose PostgreSQL smoke job on `main`.

## Production activation inputs

The code is ready for a target Ubuntu deployment. Actual activation needs the following external configuration and should be applied through the target host environment rather than committed to the repository:

1. Ubuntu host deployment access and public hostname.
2. PostgreSQL migration source or approved clean-production initialization.
3. Existing Chatwoot base URL, account/inbox identifiers, API token, webhook secret, and panel secret.
4. Selected AI provider endpoint, model, API key, and initial team knowledge entries.
5. OrcaSlicer printer profiles and the production printer mapping.
6. Production owner account, worker token, metrics token, and backup destination.

After those inputs are present, use `docs/INSTALL.md`, `deploy/ubuntu/README.md`, and `docs/PRODUCTION_READINESS.md` for the deployment, migration, smoke test, and go-live sequence.
