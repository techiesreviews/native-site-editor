---
title: Keep original
type: task (AFK)
status: closed
assignee: claude (mm-27 runner)
blocked_by: [24-media-folders-and-names, 25-image-recipe]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Originals".

- Off by default. When on, a changed file's original goes to `media/originals/` with a matching base, even when the website file went to another Files folder. Unchanged files need no duplicate.
- Hidden personal details (location, camera data) are removed from the kept original; SVG originals lose executable content.
- If the original is over the cap but the website file fits, ask whether to continue without it; never drop it silently or bypass the cap.
- Details link to the original; it is part of the Image family and never used on pages.

## Done when

- `tests/media-originals.test.ts`: path and base, personal details removed, unchanged file not duplicated, over-cap question.
- Nightly in `native-media-adding.spec.ts`: Keep original on, the original appears in details and in `media/originals/`.

## Done (2026-10-14)

- **Behaviour.** Keep original is off unless the site's records say `adding.keepOriginal: true` (slice 26's toggle writes it; this slice reads it through slice 26's `mediaAddingSettings`/`readMediaAddingSettings`, once per addition, in the Media pane/picker, Files and Review…). When on, a changed picture also stores a kept original at `media/originals/<main base>.<ext>` in the same batch and Undo step, also when the website file went into another Files folder. The original is the full-size picture with personal details removed: an upright, understood JPEG/PNG/WebP loses its metadata blocks losslessly; anything else (a turned photo, BMP, unknown blocks) is the upright picture re-encoded at full size (PNG with transparency, else JPEG 92). A guard refuses any original that still may hold hidden details or SVG executable content. No original for files stored as is (SVG, animated GIF, PDF, "Add unchanged", Review's "Keep original bytes") or when it would equal the website main. An original over the 20 MB cap while the website files fit asks **Add without the original?** (Add without original / Don't add); declining skips only that file. File details show a **Download original** button on the family's original row (fetched on click). Originals stay inside the Image family, never a tile of their own.
- **Names.** `chooseMediaPath` plans the original with the family; a base is also taken when the planned original would not join the new main's family (a same-named image in another folder), so the family is numbered (`holiday-2`). A website destination inside `media/originals/` is refused while an original is kept.
- **Code.** New `src/page-builder/media-originals.ts` (path, guard, cleaning, duplicate, cap question); `keptOriginal` in `media-prepare.ts` is shared by adding and Review…; the worker takes a separate `original` request flag (the Optimise sheet's old as-is `keepOriginal` option is unchanged); `optimiseMedia(file, options, signal, trim?, original?)` (after slice 40's `trim`; a trimmed copy never keeps an original); `MediaImportRequest.original`, `MediaOptimiseResult.original`; Files adding reads one `settings(ctx)` (image quality and Keep original) per addition; `askToAddWithoutOriginal` in the shared queued confirm dialog.
- **Slice 26 change.** Its Review… sheet started its old "Keep original bytes and metadata" box (store the file as it is, location included) from the site's Keep original. Now that box starts off and the site's choice keeps a cleaned original beside the website version, so Keep original never stores location data (`mediaOptimiseStart`, its test updated). Its Files-drop browser test now also expects `media/originals/wide.jpg`.
- **Commits** (after rebasing over slices 26, 28 and 40): 27ec60a7 claim; 119f387d build (Sol, with the runner's changes: no change to the shared records parser, original fetched on click, row flag instead of label match, rotated-photo browser check); d57bd9d6, 1157b5e7, 3a231c8e review fixes; close.
- **Tests.** New `tests/media-originals.test.ts`: path and base (media/images, Files folder, root, conflicts in `media/originals/`, a same-named main in another folder), one batch and Undo, lossless strip vs re-encode (orientation 6, unknown blocks, transparency), only `true` opts in, unchanged files and identical mains not duplicated, dirty originals refused, the over-cap question (yes/no/missing, other files continue, website file over the cap refused before asking), Files reads the setting once. Nightly in `native-media-adding.spec.ts`: Keep original on, a JPEG with Exif/GPS keeps a byte-identical-minus-Exif original in `media/originals/`, a turned photo keeps an upright full-size JPEG without Exif, details download it; Review… keeps the original too. Updated `media-file-details`, `media-files-adding-runs` tests. Ran: `npm run check`, `npm run lint`, unit 2,624/2,624; media adding, upload, library, picker, collections and file-ops specs 60/60 after round 2; adding/upload/library/picker 37/37 after round 3. After the rebase: `npm run check`, `npm run lint`, unit 2,662/2,662; full suite (`full-suite.sh 3`) 975 passed, 0 failed, 60 skipped.
- **Review (GPT-6.1 Sol), 3 rounds.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-27/review-{1,2,3}/` (result.md, run.log). Round 1, fixed: a same-named image in another folder left the original outside every family (P2). Round 2, fixed: Review… ignored the remembered Keep original (P2). Round 3, fixed: Review… could ask "without the original" when the website file was also over the cap (P2; now unit tested). Rejected validation gap: a browser test with a real 20 MB+ original; the question and its answers are unit tested, and the dialog is the shared one whose Add/Don't add/Escape flow is browser-tested by slice 30's spec.
- **Bytes.** `test:budget`: 344 KB gzip before first preview paint of 355 KB, unchanged from dev (no `main.ts` change; new code only in lazy media chunks and the worker).
- **Follow-ups.** Slice 26: its Keep original toggle writes `adding.keepOriginal`; when both land, `media-library-adding.ts`/`media-files-adding.ts` merge their quality and keep-original reads (both read the same records). Slice 29: SVG and HEIC clean-up; HEIC originals need a decoder first. Clean up (phase 4): kept originals are listed with their family.
