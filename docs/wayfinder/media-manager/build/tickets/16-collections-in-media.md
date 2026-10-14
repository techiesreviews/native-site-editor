---
title: Collections in Media
type: task (AFK)
status: closed
assignee: claude (mm-16 runner)
blocked_by: [10-one-bar, 15-collection-records]
builder: claude
phase: 1
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) and the selection bar from research [01](../../tickets/01-research-mobbin-patterns.md#resolution-2026-10-11).

- The Collections dropdown narrows the grid; its last item opens **Manage collections** (every collection with Rename and Delete, plus New collection).
- While viewing a collection, More offers Rename collection and Delete collection.
- Selecting files shows a reachable bar: **Add to collection** (with New collection), and inside a collection **Take out of <name>** and **Remove file** as separate actions.
- Details shows and edits a file's collections.

## Done when

- `@smoke` `tests/native-save/native-media-collections.spec.ts`: create a collection, add two files, view it, take one out (the file stays under All), Undo.
- Nightly: rename to a taken name says it is taken; delete a collection keeps its files; starting collections appear on a fixture with named folders.

## Done (2026-10-14)

- **Behaviour.** Selecting files shows the **selection bar** after the grid, sticky at the bottom of the scrolling pane so it stays in reach: "N selected", **Add to collection** (a menu of the other collections, one already holding every selected file shown as "Already in it", then **New collection…**, which opens a name screen and creates the collection with the selected files in one Undo step), **Take out of <name>** only while viewing a collection (membership only; the file stays under All) and **Remove file(s)** as a separate action (today's delete confirmation, which warns when pages use the file, until Recently removed in phase 4), a small ··· with **Select all shown** and **Optimise heavy images**, and **Clear**. On phones the actions take their own row. The **Collections** dropdown ends with **Manage collections…** (Media pane only; the old chooser modal has none until slice 18): every collection with its file count, **Rename** and **Delete**, plus **New collection**; it redraws after any refresh, so Undo from elsewhere shows at once. While viewing a collection, **More** adds **Rename collection** and **Delete collection**; the viewed collection follows its rename and falls back to All when deleted. The name field says "is already taken by another collection" as you type (ignoring case; a case-only rename of itself is allowed) and refuses to save; nothing merges. Delete asks first and says the files stay in Media; only the group goes. **Details** (today's sheet, slice 14 not yet landed) show the file's collections as tick boxes plus a **New collection** name field (refused when taken), saved with Save metadata as one step; the free-text Tags field is gone. Everything is in the lazy media chunk (`media-library-collections.ts`, `media-collection-choices.ts`, view/shell/grid/details changes). The old bulk bar's tag field, Tag selected and Delete unused are replaced (Remove file covers deleting; unused files belong to Clean up, slices 47/49/50).
- **Commits.** 29dcd505 claim; bc3c8f94 build; 95e6e02f review fix; close.
- **Tests.** New `tests/media-collection-choices.test.ts` (name messages: empty, taken ignoring case, renaming itself; collection sizes per tile with copies left out; selection bar labels; details' ticked plus new name). New `tests/native-save/native-media-collections.spec.ts`: `@smoke` create a collection (Manage), add two files (Add to collection), view it, take one out (stays under All), Undo; nightly: More renames (taken name refused, then renamed and followed) and deletes the viewed collection (files kept, back to All); Manage renames, refuses a taken name, deletes, and redraws on Undo; details tick and name collections (taken name refused); starting collections from named folders (a host running the real `readSiteMediaRecords` over a techies-reviews-like tree, since frozen fixtures have no named image folders: Logos and Brand assets, no dated or storage folders); collections named "Default alt text", "Decorative" and "New collection" keep their own ticks across a refresh; New collection from the bar is one Undo step and Remove file inside a collection removes the file, Undo restores it. Ported from the old "Image tags" field to "New collection" / tick boxes: `native-media-tab`, `native-media-pane`, `native-media-library`, `native-media-transaction`; the Collections option lists gain "Manage collections…". `npm run check`, `npm run lint`, unit 2459/2459; browser: media specs (collections, tab, pane, library, transaction, library-keys, action fades, alt refusal, upload) 77/77 before the review fix, collections/pane/tab/library/transaction 61/61 after; CI fonts collections + tab 33/33; smoke group 43/43. Scratch screenshots at 390, 768 and 1280 on a scratch starter with `images/logos/`, `images/team/` and `uploads/2023/09/` in `.scratch/shots/mm-16/` of the main checkout.
- **Review (GPT-6.1 Sol).** One defect fixed: membership boxes used the collection name as their form key, so a collection named like a details field could overwrite it on refresh; they now carry `data-form-key="collection:<name>"`. Its three validation gaps were added as tests (above). Nothing rejected. No re-review: the fix is small and covered by the new tests.
- **Bytes.** Boot 348 KB gzip of 355 KB. Same-sitting `build:ui` against origin/dev 3dac05f3: entry JS +7 B gzip (chunk names), entry CSS unchanged; lazy media chunk JS 10,401 → 12,458 B, CSS 3,334 → 3,693 B gzip.
- **Follow-ups.** Slice 14 moves the collection tick boxes into the new details screen. Slice 17: adding inside a viewed collection should join it. Slice 18: the picker gets the bar with Manage collections. Slice 21: agents use the same `collections(change)`. Phase 4: Remove file goes to Recently removed with ticket 10's warning.
