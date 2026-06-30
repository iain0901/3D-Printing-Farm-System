# 3DSTU FarmFlow Wiki

**3DSTU FarmFlow** is a source-available production operating system for 3D printing farms, studios, school labs, and small manufacturing teams.

It connects orders, model files, printer capability, material inventory, scheduling, operator todos, maintenance, notifications, audit logs, backups, and deployment checks into one web platform.

## What this platform is for

FarmFlow is designed for teams that need to answer operational questions quickly:

- Which jobs are late, blocked, printing, paused, or waiting for slicing?
- Which printer can run this material, nozzle, color, and build volume?
- Which spool is reserved, low, dry, or due for reorder?
- Which operator action is needed next?
- Which production change created the current state?
- Can the system be backed up, restored, and audited before go-live?

## Core modules

| Module | Purpose |
|---|---|
| Dashboard | Production cockpit for daily status, due risk, printer readiness, and human todos |
| Printers | Fleet status, hardware bridge configuration, real printer actions, telemetry |
| Orders / Quotes | Manual orders, quote intake, quote conversion, SKU-linked job generation |
| Files | STL/3MF/G-code model library, versions, previews, generated sample models, downloads |
| Queue | Job status, priority, lifecycle actions, material reservations, due-date risk |
| Scheduler | Printer matching, constraint solving, load balancing, timeline planning |
| Filament | Spool inventory, scan/usage logging, reorder planning, label export |
| Maintenance | Templates, problem reports, service jobs, incident context |
| Team / Security | Roles, Owner/Admin/Operator/Viewer/Student access, 2FA, API keys |
| Operations | Audit trail, backups, restore drills, support bundles, readiness and smoke checks |

## Screenshots

Screenshots are stored in the repository under `docs/screenshots/`.

- [Production cockpit](https://github.com/iain0901/3D-Printing-Farm-System/blob/codex/production-saas-completion-20260624/docs/screenshots/dashboard-production-cockpit.png)
- [Scheduler and capacity planning](https://github.com/iain0901/3D-Printing-Farm-System/blob/codex/production-saas-completion-20260624/docs/screenshots/scheduler-capacity-planning.png)
- [Files and model library](https://github.com/iain0901/3D-Printing-Farm-System/blob/codex/production-saas-completion-20260624/docs/screenshots/files-model-library.png)
- [Filament inventory](https://github.com/iain0901/3D-Printing-Farm-System/blob/codex/production-saas-completion-20260624/docs/screenshots/filament-inventory.png)
- [Settings, backup, and governance](https://github.com/iain0901/3D-Printing-Farm-System/blob/codex/production-saas-completion-20260624/docs/screenshots/settings-backup-governance.png)

## Wiki pages

- [Quick Start](Quick-Start.md)
- [Operator Workflow](Operator-Workflow.md)
- [Deployment and Go Live](Deployment-and-Go-Live.md)
- [Security and Operations](Security-and-Operations.md)
- [Release Candidate Status](Release-Candidate-Status.md)
