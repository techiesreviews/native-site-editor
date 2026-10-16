---
title: "Files adding: no \"Added …\" message after a repo or branch switch mid-save"
type: task (AFK)
status: open
assignee:
blocked_by: [17-media-kinds]
builder: sol
---

## What

Found by ticket 21's await-race helper. `createFilesAdding` in
`src/page-builder/media-files-adding-runs.ts` does not re-check its proof
(`host.live()` or the captured repo/branch scope) after the save settles, so a
repo or branch switch during the save still shows "Added …" in the new view.

- Capture the proof before the first await and re-check that same proof after
  every await and before every write or message (CODING_STANDARDS "Proofs
  survive awaits").
- Turn the `todo` race test from ticket 21 into a passing test.

## Files

- `src/page-builder/media-files-adding-runs.ts`
- the ticket-21 race test file for Files adding under `tests/` (turn its `todo` on)

## Done when

- The race test passes at every await point; check, unit, lint and the Files browser specs pass.
- Sol review saved under the main root `.scratch/reviews/`; landed on `dev` with CI green.
