---
title: Collection records and starting collections
type: task (AFK)
status: closed
assignee: claude (mm-15 runner)
blocked_by: [05-media-records, 08-media-undo-without-page]
builder: sol
phase: 1
---

## What

Ticket [15](../../tickets/15-collections-and-file-names.md#resolution-2026-10-14) "Collections work like tags" and "First open on an existing site".

- Operations, each one Undo step: new collection, add files to a collection, **take out of** a collection (membership only), rename (a taken name is refused, never merged), delete (only the group; files stay under All and other collections).
- **Starting collections** on first open: folders with real names become collections (`images/logos/` → Logos); date folders (`uploads/2023/09/`) and generic storage folders (`images`, `uploads`, `media/images` and the other kind folders) do not; names shown readably. Old tags already became collections in slice 05. No file moves.
- Collections never go to Recently removed.

## Done when

- `tests/media-collections.test.ts`: every operation and its undo; taken name refused; delete keeps files; starting collections from a techies-reviews-like tree (logos, brand, dated uploads, generic folders).

## Done (2026-10-14)

- **Behaviour.** `src/page-builder/media-collections.ts` (lazy media chunk) holds the collection rules over `MediaRecords`: new (optionally with files, so "New collection" from "Add to collection" is one step), add, take out (membership only; the file record and the now-empty collection stay), rename (keeps its place in the list; a name taken by another collection ignoring case is refused, a case-only rename is allowed, never merged) and delete (only the group: files keep their records and other collections). Rename and delete also update the collections remembered in Recently removed entries, so a deleted name cannot come back on the next read; nothing goes to Recently removed. `mediaCollectionNameProblem` gives slice 16 "empty"/"taken" before saving; rename/delete of a missing collection refuse in plain words. The workspace exposes `MediaPickerHost.collections(change)` (`new`, `add`, `take-out`, `rename`, `delete`), one batch editing only `.editor/media.json` per change, labelled "New collection", "Add to collection", "Take out of collection", "Rename collection", "Delete collection": one Undo step, and it works with no page open (slice 08). `load()` now returns the full list `collections` (empty ones too). **Starting collections**: when `.editor/media.json` is absent or still the old `{ tags, alt }` form, each family main file joins its nearest real-named folder (date folders, the generic storage folders `media images image img imgs videos video audio downloads documents files uploads assets static public originals wp-content`, and hidden folders skipped; copies and `media/originals/` skipped); names shown readably (`brand-assets` → Brand assets); a folder matching an old tag ignoring case joins that tag. Nothing is written just by opening; the first real change saves them. One reader (`readSiteMediaRecords`) serves every records writer: the workspace's `prepare`/`load` and the controller's Decorative write, so no first save drops them. A version-2 file always wins (deleted starting collections stay deleted). No file moves; no UI change.
- **Commits.** ebabcb54 claim; 81b8aa16 build (Sol; runner fixes: hidden folders skipped, rename/delete of a missing collection refuse instead of silently doing nothing).
- **Tests.** New `tests/media-collections.test.ts` (every operation and its Undo through real draft transactions with no page open; taken names, case-only rename, no merge; delete keeps files and does not come back after a parse round trip, including from a removed entry; starting collections from a techies-reviews-like tree with logos, brand, dated uploads, generic, hidden and nested folders, old tags and a version-2 file; load derives without writing; first description saves them; Undo restores absence); `tests/media-controller.test.ts` gains "Decorative's first save preserves starting collections". Test hosts in `media-library-filter`, `native-images-tab`, `native-media-pane` gained the new member. `npm run check`, lint, unit 2397/2397; browser `native-images-tab`, `native-media-pane`, `native-media-transaction`, `native-media-library`, `native-image-alt-refusal` 46/46.
- **Review (GPT-6.1 Sol).** No defects, no validation gaps; nothing fixed or rejected.
- **Bytes.** First paint 346 KB of 355 KB, unchanged (new code only in the lazy media chunk).
- **Follow-ups.** Slice 16 adds the screens on `collections(change)` and `MediaLibrary.collections`; slice 21 (agents) should call the same `collections(change)`. Slice 20's `list_media` should read through `readSiteMediaRecords` so agents see starting collections before the first save.
