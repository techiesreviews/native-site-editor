---
title: One preparation for every way of adding
type: task (AFK)
status: closed
assignee: claude (mm-23 runner)
blocked_by: [17-drop-to-add, 08-media-undo-without-page]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Adding and settings"; research 04 finding 1 (two upload paths share no code).

- One preparation in the browser for Media, the picker, Structure slots, component fields, Site settings, Files drops and canvas drops. `uploadFilesTo` (`src/main.ts:2443`) and its callers (`:431` Files drop, `:682`, `:1922`, `:3986` Upload files…) go through the media import batch (`applyMediaBatch`, `:2522`).
- Each addition is one Undo step, including choosing an image with a new upload (two steps today).
- A specific folder chosen by dropping in Files wins for the website file.
- Adding starts at once; nothing is placed without the picker's Use.
- Images keep today's Optimise defaults until slice 25; other kinds are stored as they are until phase 5.

## Done when

- `tests/media-prepare.test.ts`: every entry point builds the same batch; Files folder wins; one Undo step.
- `@smoke` `tests/native-save/native-media-adding.spec.ts`: upload into a Structure image slot; the file is prepared (WebP with copies) and placed; one Undo removes both.
- `native-upload.spec.ts` updated; full suite green.

## Done (2026-10-14)

- **Behaviour.** Every way of adding prepares files with one lazily loaded module, `src/page-builder/media-prepare.ts`, and saves them through the media import batch (`importMedia` in `media-workspace.ts`), so each addition is one Undo step. Raster photos and screenshots (`jpg jpeg png webp avif bmp`) use the repository's stored Optimise settings (today's defaults: 2400 px, WebP 80, copies at 480/960/1600) until slice 25. SVG, GIF, ICO and every other kind are stored exactly as they are (bytes and sanitised name, names without an extension included) until phase 5. The 20 MB cap applies to every stored output; heavy as-is images keep today's warning. A file that cannot be prepared is reported and the rest still go in.
  - **Files.** Drops and a folder's Upload files… add into the folder chosen, root included (the Files folder wins). Every other entry point uses `images/` until slice 24. A folder segment that is an existing file refuses, and an existing folder's name counts as taken. Files added from Files say "Added <paths>." and one Undo removes them.
  - **Picker** (slice 18's, used by the Edit bar, Structure, canvas double-click and drop, component and Structure slot images, Site settings). Files dropped on it, added with More → Add new file, or dropped on a page's image start preparing at once and are **held**, not saved. The first ready one of each addition is chosen; nothing is placed without Use. **Use** stops files still preparing (reported) and saves every ready held file with the placement in **one batch**: for a page image, the page swap with slice 18's description and Decorative rules in the same records edit; for component and Structure slots, the slot's address (`choosePath(place, placement)`, `MediaPathPlacement`). One Undo removes the files and the placement. Site settings saves the addition, then fills its field as before (its Apply is the later change). Cancel, Close and Escape save ready files without placing them, in one step; a repository switch drops them. Cancel while Use is saving still saves the files once, without the placement (the batch rechecks `live` just before commit). A placement decided on older records refuses newer ones.
  - **Media pane** (slice 17). Its automatic adding now uses the same preparation.
  - **Records.** Replacing a file (Optimise heavy images) carries over the whole media record: Always keep, collections, description with its by-agent mark, Decorative, places and unknown keys (slice 05 follow-up).
  - **Code.** `uploadFilesTo` in `main.ts` is a thin lazy call that keeps a repository/branch proof across the lazy import. Repositories without a native site prove media batches against the repository listing. `guarded-upload.ts` is gone.
- **Commits.** f959950a claim; 93d5fe41 preparation, workspace, Files/Upload files…, records carry-over and the first review fixes (Sol's build plus the runner's fixes, squashed to rebase over slice 18); 57b7b0b8 picker hold mode rebuilt on slice 18's picker (rebased over slice 21, whose `media-place.ts` now holds the held branch); 79860c00 round-3 review fixes.
- **Tests.**
  - New `tests/media-prepare.test.ts`: every entry point builds the same batch; the Files folder wins, root included; as-is kinds keep bytes and names; the cap; add+place is one history action with Undo/Redo; stale page and stale records refuse; a placement cancelled before commit saves nothing; adding reads files again after preparing and refuses another repository; replacing carries every record field; file segments and folder names.
  - New `tests/native-save/native-media-adding.spec.ts`: `@smoke` Structure slot "Choose image…" → add in the picker → prepared WebP with `-480w/-960w/-1600w` copies placed, one Undo removes both, Redo restores. Nightly: canvas drop held until Use; Close saves ready files once and cancels unfinished ones; Use saves files from two additions with the placement (SVG keeps 12×12); Review keeps Optimise but stays held; cancelling during Use's size read places nothing; Use with a file still preparing (one step, reported); Files drop in a repository without a home page.
  - `native-upload.spec.ts` ported: held add then Use; Files and Upload files… make WebP, the PDF stays byte for byte, one Undo/Redo, the cap. `native-media-picker.spec.ts`: the canvas-drop case is held, not saved.
  - Ran: `npm run check`, `npm run lint`, unit 2529/2529. Touched specs 87/87 after the last rebase; before it, the wider media/Structure/component/site-settings set was 188/188. Full suite on the final branch (79860c00): 958 passed, 0 failed, 60 skipped.
- **Review (GPT-6.1 Sol), 3 rounds.**
  - Round 1, fixed: a repository switch during the lazy import could add files to the new repository (P1); Files uploads failed in repositories without a native site (P2); new SVG/GIF lost width/height when placed (P2); one `@smoke` only.
  - Round 2, fixed: a held file cancelled while Use read its size could place a temporary id (P2).
  - Round 3 (after the slice 18 rebuild), fixed: Cancel while saving still placed (P1); a file finishing preparation during Use was saved as a second step (P2); the held swap ignored the records it was decided on (P2).
  - Rejected (each round): the "all entrances" unit test labels one shared helper rather than wiring each caller. Every caller goes through `prepareMediaFile`/`addPreparedMedia`, and the wiring is covered by the browser specs (Structure, canvas, picker, Files, Upload files…, pane, Site settings in slice 18's spec).
  - Validation gap left: no browser test holds the upload staging to press Cancel mid-save. The guard is unit tested, and the view's fallback save is a small branch.
- **Bytes.** Same-sitting `test:budget` against origin/dev 6c7fca63: 342 → 342 KB gzip before first preview paint (budget 355 KB). Boot entry JS 235,929 → 235,890 B gzip (−39 B), CSS ±0 (20,041 B). Against 5eb2c7f4 (before slices 18 and 21) it was −955 B.
- **Follow-ups.**
  - Slice 24: folders and names (`media/…`, `-480` copy names per ticket 07; today's copies use `-480w`).
  - Slice 25: the image recipe replaces the stored Optimise settings in `prepareMediaFile`.
  - Slice 31: the picker's held files and "N still being prepared were not added" note could join its shared progress summary.
  - Site settings: a file added in the picker is saved at Use, separately from the dialog's Apply.
