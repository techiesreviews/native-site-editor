---
title: The Improve images screen
type: task (AFK)
status: open
assignee: claude (mm-74 runner)
blocked_by: [71-outside-pictures, 72-improve-heavy-files, 73-improve-gifs-and-players, 49-media-tab-badge]
builder: claude
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "Where and how"; Wix's step-by-step fixer from research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11).

- **Improve images** in Media's More, next to Clean up. Runs only when Lex presses it.
- Rows for pages and components with their reach and what would change; a row opens to show its pictures; any picture can be unticked (remembered).
- Fix one row or **Fix all** (components included). Progress with Cancel; finished rows stay done; closing the editor stops the run with the rest still listed.
- After a run, a list of changed pages and components with **Undo** each and **Undo all**. Nothing goes live until saved.
- The Media tab badge also counts this work.

## Done when

- `@smoke` `tests/native-save/native-improve-images.spec.ts`: on a fixture page with a heavy JPEG, Improve images lists it; fix the row; the page uses a new WebP with srcset; Undo restores it.
- Nightly: untick a picture; Cancel mid-run; Undo all.
