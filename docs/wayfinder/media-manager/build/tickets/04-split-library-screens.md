---
title: Split the library view - shell, grid, details, delete, Optimise, input
type: task (AFK)
status: open
assignee: claude (mm-04 runner)
blocked_by: [03-split-library-state]
builder: sol
phase: 0
---

## What

Second half of the split on research 04's seams: shell and controls (seam 1, `:30-88`, helpers `:487-492`), grid cards (6), the detail sheet (7, split into its three jobs: metadata form, usage list, file actions, plus the picker's markup preview), delete confirmation (8), the Optimise sheet (9, with its per-repository `localStorage` defaults) and input wiring (10: arrow keys, upload input, drop zone).

- Behaviour unchanged; `media-library-view.ts` becomes a thin composer of the parts.
- Each part takes what it needs as arguments (no shared closure state), so phase 1 can swap the shell and grid for the Tiles look while details, delete and Optimise keep working.

## Done when

- `media-library-view.ts` is under 150 lines; no part reaches into another's state.
- The media e2e specs pass unchanged; full suite green; byte-budget delta reported.
- `docs/page-builder/images-pane.md` names the new files.
