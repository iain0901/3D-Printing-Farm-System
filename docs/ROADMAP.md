# Product Roadmap

3DSTU FarmFlow is moving from MVP toward a production-grade print-farm SaaS platform. The roadmap is informed by current open-source and SaaS print-farm tools such as FDM Monster, OctoFarm, Spoolman, Obico, FilaOps, LayerlyOS, Daedalus, runsodin, PrintStream, and SimplyPrint.

## Competitive Signals To Absorb

- Multi-protocol printer connectors: OctoPrint, Moonraker/Klipper, PrusaLink, Bambu LAN, Creality, Snapmaker.
- Batch printing and multiprint workflows.
- Spool inventory with automatic reservation and weight deduction. Basic scheduled-job reservation and completion deduction shipped in v0.1.5.
- Shared file library with thumbnail, version, and reprint history.
- AI or rules-based failure/anomaly detection.
- MES/SCADA-style production cockpit with no-cloud/self-hosted positioning.
- ERP/MRP concepts: products, BOM, purchasing, inventory, profitability analytics.
- Mobile-friendly PWA and operator-first UI.
- Plugin/add-on system for connectors and customer-specific workflows.

## Near-Term Product Phases

1. Documentation and public project maturity.
2. Printer bridge hardening with connector test harnesses.
3. File preview and G-code visualization.
4. Customer onboarding, tenant provisioning, and production support flows.
5. Plugin SDK for external connectors.

## Recently Shipped

- v0.1.5: Scheduled jobs reserve matching material spools, completed jobs deduct reserved grams, failed or cancelled jobs release reservations, and the filament inventory page shows reserved and available grams.
- v0.1.6: History records now capture structured failure category, root cause, corrective action, waste grams, waste cost, optional waste inventory deduction, analytics waste totals, root-cause rollups, and printer reliability/waste summaries.
- v0.1.7: Go-live readiness adds an operator/admin checklist, automatic readiness signals, manual completion tracking, and a redacted 3DSTU support snapshot export for production support without exposing secrets.
- v0.1.8: Printer bridge diagnostics now validate URL shape, adapter support, credential presence, endpoint response, latency, safe status snapshots, and operator-facing remediation guidance for OctoPrint, Moonraker, and manual bridge setups.
- v0.1.9: File previews add a safe backend preview endpoint, G-code toolpath/layer summaries, build-plate occupancy, compatible-printer matching, warning surfacing, and an operator drawer in the file library.
- v0.1.10: Production templates add reusable file/SKU recipes, dry-run queue creation, one-click job generation, integrity checks for linked files and printers, support snapshot counts, and a global version footer across every app page.
- v0.1.11: Filament purchasing adds low-stock reorder planning, purchase request tracking, ordered/received states, receive-to-inventory spool creation, integrity checks, support snapshot counts, and operator controls on the filament page.
- v0.1.12: Public quote intake adds website quote submissions, operator quote review, quote-to-order conversion, linked order records, and customer intake UI on the marketing site and Orders page.
- v0.1.13: GitHub CI and release runbook add automated build/test evidence for every push and a documented versioned release workflow for VPS deployments.
- v0.1.14: PrusaLink printer bridges add local PrusaLink status polling, safe diagnostics, UI configuration, and pause/resume/cancel job control alongside OctoPrint and Moonraker.
- v0.1.15: Customer quote intake now accepts real STL/3MF/G-code/OBJ model uploads, stores them in the shared file library, links them to quote requests, and exposes operator downloads from the Orders page.
- v0.1.16: Accepted quote requests with attached model files now create linked production orders and queue jobs in one handoff, keeping the uploaded file protected and ready for slicing or scheduling.
- v0.1.17: Public quote tracking adds customer access tokens, status lookup, and customer accept/reject decisions; accepted quotes convert into production orders through the same queue handoff path.
- v0.1.18: The public website quote lookup now exposes customer approval and rejection controls, completing the customer-facing quote decision loop from UI to API.
- v0.1.19: Operators can generate, copy, and rotate customer quote portal links; public quote URLs can preload tracking credentials for direct customer review.
- v0.1.20: Quote validity windows add operator-set expiration dates, customer-visible validity messaging, and expired-quote approval protection in the public portal.
- v0.1.21: Customer quote revision requests let buyers ask for changes from the portal, return quotes to operator review, preserve customer notes, and avoid premature order conversion.
- v0.1.22: Production order lifecycle controls add hold, shipped, completed, and cancellation states; cancelled orders stop linked non-terminal generated jobs, release reserved filament, and block new job generation for terminal orders.
- v0.1.23: A customer directory (CRM) tracks contacts, tags, notes, and linked quote/order history, auto-created from quote intake by email. The public quote form adds Quick-quote and Expert-mode paths with use-case presets, process/material/color/quality/layer-height/infill/wall/support/finishing options, and a live instant price estimate. The deployment model moves from self-service signup to single-tenant-per-customer: `scripts/provision-tenant.sh` scaffolds an isolated, independently provisioned environment (unique Compose project, container, port, and data volume) for each customer.
- v0.1.24: A customer-facing account system lets buyers register, sign in, or claim portal access from an existing quote link; signed-in customers see only their own quotes and orders, approve/decline/request-revision on quotes from their dashboard, and exchange two-way messages with operators on each quote. Operators reply from the same quote record in the Orders page.
- v0.1.25: Customer accounts add self-service password reset and profile editing, a staged progress indicator (Submitted -> Quoted -> Approved -> In production -> Shipped -> Completed) on the customer dashboard, and shipment carrier/tracking number fields operators can set and customers can see. Optional SMTP-based email notifies customers when a quote is ready or when an operator sends a new message; the feature no-ops when SMTP is not configured. Operators see an unread-message indicator per quote in the Orders page and can reply inline.

## Definition Of Done For A Real Release

- Tested production deployment path.
- Backup and restore drill.
- Operator documentation.
- Admin documentation.
- Versioned release notes.
- Clean GitHub repository metadata, topics, and security policy.
- Public website that explains the product, install path, support path, and roadmap.

## Localization Strategy

The public marketing website is English-first while product structure, positioning, and roadmap are still moving quickly. Traditional Chinese and Simplified Chinese localization should be completed in one coordinated pass after the English information architecture, copy, and feature set are approved. The in-app language infrastructure remains in place.
