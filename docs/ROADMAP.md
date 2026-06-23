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
