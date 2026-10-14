---
title: media/ kind folders and tidy names
type: task (AFK)
status: closed
assignee: claude (mm-24 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Storage and names".

- New files go to `media/images/`, `media/videos/`, `media/audio/` and `media/downloads/` by the resulting kind. Existing files are not moved.
- Names: keep the incoming basename only, lowercase, spaces and punctuation to hyphens, collapse and trim hyphens, keep letters and numbers from other languages, `media` if nothing usable is left, extension from the actual output.
- Conflicts get a number; never replace a file. Choose a base free across the whole family (copies, originals folder, previews).
- Copies beside the main image as `holiday-480.webp`.
- Amend [ADR 0001](../../../../adr/0001-the-repository-is-the-site.md) for the `media/` folders (existing `images/` paths stay valid); update the conventions' folder line in the Media chapter in slice 37.

## Done when

- `tests/media-names.test.ts`: every naming rule, other languages, empty names, path segments dropped, conflicts across a family and the originals folder.
- `native-media-adding.spec.ts` nightly: two files named `Holiday Photo.JPG` become `holiday-photo.webp` and `holiday-photo-2.webp`.

## Done (2026-10-14)

- **Behaviour.** Every way of adding media (Media pane, picker, Structure and component slots, canvas drops, Site settings, Optimise's Review…) stores new files in `media/images/`, `media/videos/`, `media/audio/` or `media/downloads/` by the kind of the file stored, not the one dropped (a JPEG prepared as WebP goes to `media/images/`; a PDF or unknown file to `media/downloads/`). A folder chosen by dropping in Files, or a folder's Upload files…, still wins, root included. The Optimise sheet's folder field defaults to `media/images`. Existing files are not moved.
  - **Names.** Incoming basename only (path segments dropped), NFC, lowercase, every run of non-letters/numbers to one hyphen, trimmed; letters, combining marks and numbers from any language kept (`नमस्ते.png`, `東京-タワー.jpg`); `media` when nothing usable is left; extension from the actual output. Copies sit beside the main as `holiday-480.webp` (bare at 480/960/1600; a custom Optimise width keeps `-1200w` so families still find it).
  - **Conflicts.** A base is free only when, compared in lower case: no planned member (main, copies, a planned original) exists or is a folder; no file in the folder has the same name in another format (keeps the base free for previews and unambiguous originals); no file in `media/originals/` has that base; and adding the family neither adopts an existing file nor detaches one from its family (`mediaFamilies` before/after). Otherwise `-2`, `-3`, …; a file is never replaced. `chooseMediaPath` takes an optional `original` extension for slice 27.
  - **Code.** New lazy `src/page-builder/media-storage.ts` (kind folders, storage names, copy names, `chooseMediaPath`, `mediaNeedsPreparation` moved here and re-exported by `media-prepare.ts`). New `src/page-builder/media-names.ts` with slice 52's exports, except `tidyMediaName` also keeps `\p{M}` and normalises to NFC. `mediaVariantName` writes bare standard widths. `importMedia` no longer uses `uploadPath`/`uploadFileName` for new files; `DEFAULT_IMAGE_FOLDER` and `MEDIA_ADDING_FOLDER` are gone. ADR 0001's amendment is marked implemented, with `media/` in the illustrated tree.
- **Commits.** 990dc9a8 claim; b36ab8cb build (Sol, with the runner's fixes: linear family comparison, shared raster rule, no leftover constant); 2f6bfe3b review fix; close. Rebased over slices 52 and 30: `media-names.ts` keeps slice 52's file with this slice's `\p{M}` + NFC line; slice 30's Large download note now predicts the tidy name and `-480` copy names (`mediaStorageName`/`mediaCopyName`); both slices' tests kept.
- **Tests.** New `tests/media-names.test.ts`: every naming rule, French/Turkish/decomposed accents, Japanese, Devanagari marks, Cyrillic, Arabic, emoji/punctuation/empty → `media`, path segments (`a/b`, `C:\`, `../..`), output extension, every kind folder, copy names, conflicts across a family (`-480`, `-960w`), the originals folder (owned and orphan), another format, case, a folder of that name, `photo-480` beside `photo.webp`, root, numbered batch families, an explicit `media/originals/` destination (and nested) completing, 3,000 numbered originals in under a second. Updated `media-prepare`, `media-adding-rules`, `media-workspace`, `media-metadata` unit tests; `native-media-adding.spec.ts` nightly: two `Holiday Photo.JPG` → `media/images/holiday-photo.webp` and `holiday-photo-2.webp` with their copies; `native-upload`, `native-media-collections`, `native-media-picker` expectations moved to `media/…` and `-480`. Ran `npm run check`, `npm run lint`, unit 2547/2547. Full suite (`full-suite.sh 3`, df2a83bc): 947 passed, 14 failed, 60 skipped; all 13 `native-media-pane` cases ("Open a repository before choosing an image": the harness's own module import under shard load) and `native-link` "Escape with the address empty" passed on rerun on af5d1275 (20/20). Sol's build run: touched specs 32/32 with local and CI fonts.
- **After the rebase** (same code as this close commit): `npm run check`, `npm run lint`, unit 2587/2587; native-upload, -media-adding, -media-collections, -media-picker, -media-library, -media-pane, -media-tab, -file-ops 95/95.
- **Review (GPT-6.1 Sol), 2 rounds.** Round 1, fixed: an image with copies added into `media/originals/` (explicit Files destination) never found a free name and froze the editor (P1), because files there never form one family; the rule is now "the new files' families take no existing file". Its nit, also fixed: bases used in `media/originals/` are refused before rebuilding families (5.7 s → ~30 ms for 3,000 numbered originals). Round 2: no defects, no gaps. It confirmed the `\p{M}` + NFC difference from slice 52 is correct. Nothing rejected. Evidence: main checkout `.scratch/reviews/mm-24/round-1/run.log`, `round-2/run.log`.
- **Bytes.** `test:budget`: 342 KB gzip before first preview paint (budget 355 KB), as before. Same-sitting `build:ui` against origin/dev c49c4f66: entry JS 236,951 → 235,868 B gzip (−1,083 B), CSS unchanged (20,041 B); naming code only in lazy media chunks.
- **Follow-ups.**
  - Slice 52 (landed first): its `tidyMediaName` now keeps combining marks and normalises to NFC, so renames keep `नमस्ते` whole too.
  - Slice 27: pass the original's extension as `chooseMediaPath({ original })` so the base is checked with the original planned in `media/originals/`.
  - Slice 37: the Media chapter's folder line (`media/<kind>/`, tidy names, `-480` copies).
  - Slice 25: `mediaAddingPath` predicts `.webp` for prepared rasters; transparent PNG results may differ (only the "Show new files" filter uses the prediction).
