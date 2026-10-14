---
title: Recently removed
type: task (AFK)
status: closed
assignee: claude (mm-48 runner)
blocked_by: [47-clean-up-suggestions, 40-trimmed-copies]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-safe-clean-up.md#resolution-2026-10-13) "Removing and getting files back" and "Image families".

- Removing a file records it in `.editor/media.json`'s removed list (slice 05) for 30 days.
- **GitHub projects** restore from the repository's history (the blob at the last commit that had it), so the site does not grow and visitors cannot reach removed files. **Local folder projects** keep a copy in the browser for 30 days; clearing browser data loses it.
- A restored file returns to the same address; its records (collections, description, Always keep) come back.
- Families (copies, original, and from phase 5 the still and subtitles) are removed and restored together; Trimmed copies made from it stay while used.
- An old trimmed copy replaced on re-crop (slice 40) now goes here too.
- Before saving, Undo works as for other changes. Entries older than 30 days are dropped.

## Done when

- `tests/recently-removed.test.ts`: record on remove, restore from a blob SHA, local browser copy, family together, 30-day expiry, restore to the same address.
- `tests/media-workspace.test.ts`: remove and restore as batches.

## Done (2026-10-14)

- **Behaviour.** The engine behind Recently removed; no list screen yet (slice 51 calls it). New lazy module `src/page-builder/recently-removed.ts`.
  - **Recording.** Every removal writes one entry per Image family to `.editor/media.json`'s `removed` list: the main's path, date (UTC day), its id, the other members (copies, kept originals of any format) each with their own id, and every member's file record (collections, description, Always keep, `trimmedFrom`), which leave `files`. A Trimmed copy is its own family and stays. The id is the **Git blob SHA** when the bytes are committed (no draft, or a moved file's blob), else a **browser copy** (`browserKey` `removed:<date>:<blob sha>` in IndexedDB `native-site-editor-removed`): unsaved uploads, edited text such as an SVG, and every file of a project without history (`MediaWorkspaceContext.history: false`, the seam for local folders, which are not built yet: ADR 0002). Recorded by Media's Remove (several families in one batch, one Undo step), by a re-crop's previous trimmed copy (slice 40, now also closing its address-reuse gap), and by the Files tab and the agent's `delete_file` (browser copies written only once Delete is confirmed; a refusal if they cannot be kept).
  - **Restoring.** `workspace.restore([{ path, id }])`: whole families back to the same addresses with their records, one batch and one Undo step; any taken address refuses everything. A GitHub file returns as a draft pointing at its old blob (new batch step `restores`; saved as that existing blob, so nothing is uploaded and the site does not grow); before saving it just drops the deletion draft. A browser copy returns as an upload (an edited text file as its edit again); a missing copy refuses with a plain message.
  - **Housekeeping.** Entries older than 30 days are dropped on every removal/restore write and from the list; expired browser copies are swept. A file brought back outside Media (the Files tab's or Save's Restore) is recognised by its present blob and gets its and its family's records back, in every Media batch, the library view and the Files tab. `load()` returns `removed` (newest first) for slice 51.
- **Commits.** 5e2f7dbe claim; ef943d9a build (Sol; runner: one IndexedDB handle, `history` required); c7cbacbc round-1 fixes; 8ea30f30 round-2 fixes; then this close.
- **Tests.** New `tests/recently-removed.test.ts` (record on remove, restore from a blob SHA with no upload before and after saving, local browser copy and missing copy, family together and trimmed copy apart, 30 vs 31 days and sweep, same address and taken address, already-back entries with records returned, edited SVG back outside Media). Extended `media-workspace` (remove and restore as batches with Undo; re-crop's previous copy recorded with its records; pruning on writes), `media-draft-transaction` (`restores` with Undo/Redo, refusals), `file-operations-controller` (family entry with records and Undo; malformed records refuse; unsaved members' browser copies after confirmation, none on cancel; TIFF original; family restored through Files keeps records). `npm run check`, `npm run lint`, unit 2678/2678. Browser: native-media-transaction, -file-ops, -media-library, -asset-references, -images-tab, -mcp-media: first run 32/34, second 33/34, a different load-related timeout each time (APNG worker, rename forwarding, family rename click); all pass on rerun (23/23 for -media-library and -file-ops on 8ea30f30).
- **Review (GPT-6.1 Sol).** Logs: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-48/round-{1,2}/`. Round 1, fixed: records lost when a deletion was undone by the Files tab's Restore (P1); Files delete skipped unsaved uploads (P2); kept originals in non-media formats left out (P2). Round 2 (Sol ran through its own delegates after read-only `codex exec` failed to start in the sandbox; status complete), fixed: browser-copy files not recognised as back (P2); the Files tab checked only the main of a back family (P2). Rejected: none.
- **Bytes.** First paint 344 KB of 355 KB, unchanged; boot entry about +0.2 KB gzip (new batch field, store getter, Files-tab hook); the rules load on demand.
- **Follow-ups.** Slice 51: list from `load().removed`, restore with `{ path, id: sha ?? browserKey }`, show the taken-address and missing-copy refusals. Media controller's place-description state reads raw records, so a file brought back outside Media shows its description there after the next Media change. Local folders (ADR 0002) set `history: false`.
