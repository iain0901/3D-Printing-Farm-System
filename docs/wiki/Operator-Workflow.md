# Operator Workflow

FarmFlow is organized around the daily flow of a real print farm.

## 1. Intake work

Create or import work from:

- Manual orders
- Quote requests
- CSV intake
- Commerce connectors
- SKU-linked product templates

Each order or quote should become structured production work with material, file, quantity, due date, priority, and owner context.

## 2. Prepare files

Use the Files module to manage:

- STL, 3MF, OBJ, and G-code files
- Version history
- File previews
- Generated sample models
- Slicer output
- Storage-backed downloads

The goal is to make every production job traceable to the exact model and file version used.

## 3. Match printers and materials

Before a job reaches the printer, FarmFlow checks practical constraints:

- Build volume
- Material compatibility
- Color and spool availability
- Nozzle/process profile
- Due-date risk
- Printer status and queue load

## 4. Schedule production

Use the Scheduler to:

- Place unscheduled work onto printers
- Run auto-scheduling or constraint solving
- Balance printer load
- Minimize material/color changeovers
- See risks before they become late jobs

## 5. Run the shop floor

Operators work from the Dashboard, Queue, and Auto Todos views.

Typical actions:

- Start, pause, resume, complete, fail, or cancel queue jobs
- Resolve generated todos
- Record maintenance or printer issues
- Scan or update spool usage
- Review due-risk and blocked-work warnings

## 6. Close the loop

When work is finished, FarmFlow preserves operational context through:

- Job history
- Reprint records
- Audit events
- Material consumption
- Backup/export evidence
- Support snapshots

This makes repeat production and incident review easier than relying on chat logs or spreadsheets.
