---
title: Adding progress at every entry point
type: task (AFK)
status: closed
assignee: claude (mm-31 runner)
blocked_by: [30-limits-and-repo-size]
builder: claude
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13): "Adding starts automatically, with a short progress summary and cancellation". Research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11) §4.

- One short progress summary with Cancel, shared by every way of adding (Media, picker, Structure slot, component field, Site settings, Files, canvas drop), following the Media tray from slice 17.
- Large download notes, failures with their advice, partial success and Retry shown there.
- The Optimise sheet's per-file before/after stays reachable from it for images.

## Done when

- Nightly in `native-media-adding.spec.ts`: add three files from the Files tab, cancel one, see a Large download note on a big PDF.
- Screens checked at 390 and 1280 px.

## Done (2026-10-14)

- **Behaviour.** One short progress summary, `src/page-builder/media-adding-summary.ts` (lazy, with its own CSS), is shared by every way of adding (ticket 07):
  - **Media** (slice 17's tray) and the **picker** (Edit bar, Structure slots, component fields, Site settings, canvas double-click and drop) draw it above their tiles; per-file progress and Cancel stay on the tiles.
  - **Files drops and a folder's Upload files…** had no progress before; they now show it at the foot of the Files panel ("Files being added", sticky while the tree scrolls). Each file being added has a row with its state and a 44 px **Cancel adding <name>**, plus a bar and **Cancel** for all. Preparation is one file at a time; the ready files of one drop are saved in one batch into the folder chosen (one Undo step), as before. A drop made meanwhile waits its turn as its own addition instead of being refused. `src/page-builder/media-files-adding-runs.ts` (no DOM) and `media-files-adding.ts` (lazy chunk, 1.4 KB gzip).
  - Everywhere it shows **Large download notes** with their files (they no longer flash once in the message line), failures with their reason and advice (a reason that already names the file is not prefixed again), partial success ("Added 2 files · 1 could not be added") and **Retry**. Retry re-prepares the failed files in the same addition, collection and folder. It shows once nothing is still on its way; in the picker, held ready files don't hide it.
  - **Review…** (the Optimise sheet's per-file before/after) stays on the Media and picker trays. From Files it takes the pictures not added yet (or failed) to Media's Optimise sheet, still bound for the dropped folder. It shows only when the Media tab exists. A root drop's destination field reads `images` there (the sheet's existing default).
  - The **"Add unchanged file?"** question (slice 30) now opens inside the open explorer popover, as the other confirm dialogs do. Before, its modal closed the explorer, which hid the Files or Media summary behind it.
  - `addPreparedMedia` is gone; `importPreparedMedia` keeps its repository proof for the Files save.
- **Commits.** 0958ab50 claim; 64f63339 build; 951b63d4 wording and test stub; 4076baa9 review fixes; close.
- **Tests.** New `tests/media-files-adding-runs.test.ts` (start at once, cancel one, one batch; note kept; advice and Retry; save failure and Retry; queued second drop and Cancel; repository switch; Review… takes pictures with their folder; a drop after a switch stops the stale preparation). `tests/media-adding-rules.test.ts` (offers, reviewable, failed line). `tests/media-controller.test.ts` (Review… only in its own repository). `tests/media-prepare.test.ts` ported to `importPreparedMedia`. Nightly in `native-media-adding.spec.ts`:
  - Files: three files start at once with progress, one is cancelled, a 12 MB PDF shows a Large download note, and one Undo removes the drop.
  - Files: the consent question, clicked through (slice 30's follow-up). **Add unchanged** adds it; **Don't add** leaves it failed with Retry; Retry asks again; Escape adds nothing.
  - `native-upload.spec.ts`: the 20 MB refusal is read from the summary. `native-media-collections.spec.ts`: the failed line names the file.
  - Ran: `npm run check`, `npm run lint`, unit 2589/2589 (before review fixes; their 35 touched units pass). Browser: adding, upload, collections, picker and pane specs 48/48; adding and upload 13/13 after review fixes.
  - Scratch screenshots at 1280 and 390 are in `.scratch/shots/mm-31/` of the main checkout: Files progress, Files added with the note, Files failure with Retry, and the Media tray with a note.
- **Review (GPT-6.1 Sol), 1 round.** Evidence: `.scratch/reviews/mm-31/round-1/` (result.md, run.log) in the main checkout. Fixed 2, both now unit tested:
  - P1: Review… could open one repository's files in another repository's Optimise sheet after a switch during the pane load. It now keeps a stamp and identity proof across both awaits.
  - P2: after a switch, a new drop hid the old addition without stopping its preparation, so new files queued behind it and a stale consent question could appear. Stale additions are now aborted.
  - Its validation gap on 390/1280 is covered by the scratch screenshots. Nothing rejected; no re-review, since the fixes are small and tested.
- **Bytes.** `test:budget`: 344 KB gzip before first preview paint of 355 KB. Same-sitting build against the merge base: boot entry JS 236,951 → 237,049 B gzip (+98 B: the lazy Files hand-off and the Review… wiring); boot CSS ±0. The summary, its CSS and Files adding are in lazy chunks.
- **Follow-ups.** Slice 26 (Adding settings in More) could link from the summary. The picker's "N still being prepared were not added" is still announced after Use/Close, when the picker and its summary are gone. Slice 29: HEIC is still stored as it is, so it never reaches the summary's advice.
