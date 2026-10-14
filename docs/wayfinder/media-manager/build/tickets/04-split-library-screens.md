---
title: Split the library view - shell, grid, details, delete, Optimise, input
type: task (AFK)
status: closed
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

## Done (2026-10-14)

- **Behaviour.** `media-library-view.ts` (405 → 141 lines) composes parts in `src/page-builder/`, all in the lazy media chunk: `media-library-shell.ts` (frame and controls; bulk actions arrive as callbacks) with `media-library-fields.ts` (control helpers); `media-library-grid.ts` (tag chips, summary, cards, lazy thumbnails, browse focus; takes its tag, selection and observers and returns the tag in use); `media-library-details.ts` (open sequence and focus rules, then the metadata form, usage list, file actions and the picker's insertion preview as separate functions); `media-library-delete.ts` (confirmation and focus after delete); `media-library-optimise.ts` (the Optimise sheet) with `media-library-optimise-rules.ts` (per-repository stored settings, import requests); `media-library-input.ts` (filters, arrow keys, upload input, drop). Details, delete and Optimise share one side-sheet record, `media-library-sheet.ts` (version, open path, pending focus, running preview); the grid and shell never touch it, so phase 1 can swap them. Every part gets read-only getters and callbacks; none writes another's state. Bodies moved unchanged; nothing visible changes. `docs/page-builder/images-pane.md` names the files.
- **Commits.** 626b938f claim; 459befc3 split (built by Sol; its first wiring passed every part one object with setters into all the view's state, so the runner reworked the interfaces); 5b4a26a0 keyboard spec; close.
- **Tests.** New `tests/media-library-optimise-rules.test.ts` (stored settings missing, malformed, partial, per repository, storage throwing; import requests: folder trimming, `.`/`..`/backslash refusal, existing-file folder, metadata and replaceFrom only for existing, receipts) and `tests/media-library-input.test.ts` (arrow steps, clamping, other keys); new `tests/native-save/native-media-library-keys.spec.ts` (Right/Down/Up/Left against the laid-out columns, Enter opens details; 3/3). `npm run check`, `npm run lint`, unit 2388/2388. `native-images-tab`, `native-media-library`, `native-media-pane`, `native-media-transaction`, `native-image-alt-refusal`, `native-upload` unchanged, 47/47. Full suite (3 shards): 893 passed, 2 failed, 60 skipped. Both failures also fail on the untouched base ffc0ed44 and on origin/dev: `native-structure.spec.ts:77` expects the status "Image marked decorative", which slice 13 (b8c1d339) renamed to "Alt text removed" in the edit bar without updating the spec; `native-block-bars.spec.ts:76` times out waiting for the edit bar's Alt text button after closing the chooser, same area. Not caused by this slice.
- **Review (GPT-6.1 Sol, read-only).** No defects on spec or standards; bodies, focus and stale guards confirmed unchanged. One validation gap (no browser test of grid arrow keys) fixed in 5b4a26a0. Nothing rejected.
- **Bytes.** Boot 346 KB gzip of 355 KB, within. Lazy media chunk 9,130 → 10,005 B gzip (+875 B: argument and interface names); entry +7 B (changed chunk reference only).
- **Follow-ups.** Slice 13's owner (or the lead): fix `native-structure.spec.ts:77` and `native-block-bars.spec.ts:76`, which fail on dev since b8c1d339.
