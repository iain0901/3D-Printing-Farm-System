# OrcaSlicer production profiles

Place the approved machine/process JSON and filament JSON files for this farm in this directory.

Set the worker environment values to paths inside the container, for example:

```env
ORCA_SLICER_SETTINGS_PATH=/profiles/COREXY-0.4-printer.json;/profiles/0.20-standard-process.json
ORCA_SLICER_FILAMENT_PATH=/profiles/PETG.json
```

For a specific case, the internal API accepts `settingsPath` and `filamentPath` on
`POST /api/cases/:id/orca-slice`; that case-level selection takes precedence.
The worker runs a pinned OrcaSlicer release, fetches the private source file through
the internal worker API, exports G-code, records time/material estimates, and waits
for a human G-code approval before the case can become ready to print.
