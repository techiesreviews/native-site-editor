---
title: Drop to add into the viewed collection
type: task (AFK)
status: closed
assignee: claude (mm-17 runner)
blocked_by: [16-collections-in-media]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12) "Adding by drop".

- Dropping files on Media starts adding at once; the grid stays usable. Progress is drawn on the new tiles, with a small tray where failed files stay findable, and Cancel.
- Dropped files join the collection being viewed; under All collections they join none.
- A search that hides the new files offers a way to show them.
- **Add new file** in More opens the file chooser and follows the same path.
- Uses today's Optimise path and defaults until phase 2 replaces it (slice 23); the Optimise sheet's before/after review stays reachable from the tray.

## Done when

- Nightly cases in `native-media-collections.spec.ts`: drop two images while viewing a collection, both join it; cancel one mid-way; drop while searching shows "Show new files".
- No change to what is stored compared with today's Images tab upload.

## Done (2026-10-14)

- **Behaviour.** In the Media pane, dropping files (the pane shows a dashed outline while files are dragged over it) or choosing them with **More → Add new file** starts adding at once; there is no Optimise sheet first. Each file is prepared on today's Optimise path with the repository's stored Optimise settings (defaults 2400 px, WebP 80, responsive copies) into today's `images/` folder, one at a time, while the grid stays usable (search, Collections, More, details). Each file gets a tile of its own at the start of the grid: its picture dimmed, **Waiting** / **Preparing…** / **Ready** / **Adding…**, a thin progress bar, and a 44 px **Cancel adding <name>** until it is saved. The ready files are saved in **one batch** that also adds them to the collection viewed at the drop (`MediaImportRequest.collection`, written by `media-workspace.ts` in the same records edit): one Undo step per drop. Under All collections the records are untouched, so what is stored matches today's upload. Renaming that collection meanwhile carries the files to the new name; if it was deleted they go under All with a message. A tray above the grid, "Files being added", shows **Adding N files** with a progress bar and **Cancel** (all files not yet saved). When finished it shows **Added N files** / **· N could not be added**, failed files listed with their reason, **Review…** (stops automatic adding for files not saved yet, or takes the failed ones, and opens today's Optimise sheet with its before/after review, keeping the collection), **Show new files** when the search, kind or collection hides them (clears search and kind; from another collection, views the one they joined) and **Dismiss**. A second drop while one is being added is refused with "Files are still being added. Try again when they finish." The Choose image modal keeps the Optimise sheet for drops and uploads until slice 18. New code: `media-library-adding.ts`, `media-adding-rules.ts` (lazy media chunk); `media-busy-lock.ts` gains `idle()` and lets cancelling while adding through a running change.
- **Commits.** b0450e8b claim; 3b7a90e8 build; 9092f76f review fixes; 3eb26b60 Dismiss style; b574a552 review tests; close.
- **Tests.** New `tests/media-adding-rules.test.ts` (tray words and counts, cancelled files leaving the count; shown by collection, kind and search; a saved file matched by its own record; Show new files). `tests/media-workspace.test.ts`: new files join the collection in the same batch and one Undo step, no records change under All, a missing collection refuses the whole batch. `tests/media-library-optimise-rules.test.ts`: collection only for new files. `native-media-collections.spec.ts` nightly: drop two images while viewing a collection (both join it, one Undo removes files and membership); cancel one mid-way (progress on tiles, tray total, search usable meanwhile, the other added); Add new file while a search hides the new file offers Show new files (records untouched under All); rename during preparation; Review… during preparation in a collection; a file that cannot be prepared stays in the tray with its reason and Review…; a cancelled drop's waiting save never takes a later drop's files. `npm run check`, `npm run lint`, unit 2470/2470; media-collections 15/15; media collections, tab, pane, library, library keys, transaction, screen, policy, upload, alt refusal, action fades, asset references: 91 passed, 3 failed then passed on rerun (the known "hidden Restore" flake; a list case and a transaction case hit by a second run sharing the results folder). Scratch screenshots at 390, 768 and 1280 (mid-progress, added, hidden by a search) in `.scratch/shots/mm-17/` of the main checkout.
- **Review (GPT-6.1 Sol).** First review: 2 fixed. After Cancel, an older drop's waiting save could save a later drop's ready files as a second batch; each drop now keeps its own run. A rename during preparation sent the files to All; they now follow the rename. Re-review: no defects; its validation gap (Review… in a collection, a failed file) is added as tests. Nothing rejected. The ticket was followed over the prototype where they differ (per-tile progress and cancel, Review… from the tray).
- **Bytes.** Boot 348 KB gzip of 355 KB (unchanged). Same-sitting `build:ui` against origin/dev: entry JS and CSS no larger; lazy media chunk JS 13,592 → 15,276 B, CSS 4,986 → 5,231 B gzip (before the review fixes, which add a few bytes).
- **Follow-ups.** Slice 18 (picker): adding inside the picker should use this path and never place without Use. Slice 23 replaces the Optimise preparation and its settings; slice 24 the `images/` folder; slice 31 can reuse the tiles and tray for adding elsewhere and may queue a second drop instead of refusing it.
