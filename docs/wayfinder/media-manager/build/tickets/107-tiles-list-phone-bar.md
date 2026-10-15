---
title: Tiles, list view, selection bar and the phone One bar
type: task (AFK)
status: closed
assignee: claude (mm-107 runner)
blocked_by: [104-media-panel-size, 106-touch-dark-fixes]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#media-tiles-gallery-and-one-bar-a-01-to-a-08): Media gallery, list view, selection, picker tiles.

- Heavy pictures (such as the 2.1 MB JPEGs) show a downscaled picture on their tile and list row, not a grey "JPG" document icon. The tile falls back when `h.bytes(preview)` rejects or the image errors (`tilePicture`, `media-library-grid.ts:180-190`); find the cause first (likely a 1 MB read limit in the byte path).
- The tile's top shade shrinks to a 36 px band at about 35 % strength (number keeps 4.5:1). Tiles read as photos first (Google Photos / Apple Photos: white glyphs, no chip).
- Phone One bar: the Collections trigger shows the short name ("All", "Garden") with `max-inline-size: 40%`; search takes the rest, so typed words are not cut.
- The by-agent mark on a tile gets the To check icon and the label "Written by an agent – check in To check".
- List view: a fixed 48 px thumbnail column (icon on `--surface-subtle` when there is no picture) so every name lines up; the count shows once, as words ("Used on 1 page"), keeping the agreed states distinct: "No uses found", "Other uses found", "Not checked yet" (map ticket 06); never "Not used".
- Phone selection bar: one 56 px row: "✕ 3" (clear and count), Add to collection, ⋯ (Remove files… last). Wider screens keep their one row.
- Pictures with transparency and pictures wider than 2:1 show whole (`object-fit: contain`) on the checkerboard from slice 106; photos stay cropped.

## Done when

- Also shot (not in the audit's sets): the gallery while loading and after a load error, and usage "Not checked yet" / "Other uses found".
- Specs: a heavy JPEG tile has an `<img>`; list rows' name columns share one x position; the phone search field is at least 55 % of the bar.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Cause of the grey "JPG" tiles.** Not a 1 MB limit: the Worker's `GET /api/blob` refused any blob over 2 MB with a 413 (`GitHub.bytes`, `maxAssetBytes`), so `h.bytes(preview)` rejected and the tile fell back to its type icon. The same refusal hit File details, the preview and "Optimise heavy images" for those files.

**Behaviour.**
- `/api/blob` reads a blob whose base64 JSON fits 4 MB as before (cached); when that read is too large, the Worker streams the blob raw from GitHub (`Accept: application/vnd.github.raw+json`) up to 20 MB (`MAX_FILE_BYTES`, now also the upload cap), never holding it. The file type is checked before GitHub is asked.
- Tiles and list rows of pictures over 1 MB show a 480 px (shorter side) WebP copy made once per picture (`media-tile-picture.ts`, lazy media chunk), released with the view's byte cache. No copy address is made after the view closes.
- The tile's top shade is a 36 px band at 35 % (no blur); the number keeps a dark halo.
- See-through pictures (checkerboard, slice 106) and pictures wider than 2:1 show whole (`object-fit: contain`); photos stay cropped. A wide opaque picture sits on a plain light backing (97 % grey), not the checkerboard, which would say it is see-through. On these whole tiles the band goes and the number and circle are dark with a light halo.
- The by-agent mark (robot, as in To check's rows) reads "Written by an agent – check in To check" (tooltip and label).
- List: a fixed 48 px picture column (the file's icon on `--surface-subtle` when there is no picture), so every name starts at one x; usage shows once, in words ("Used on 1 page", "No uses found", "0 pages · Other uses found", "Not checked yet"); the number bubble stays on tiles only.
- Phone One bar (Media and the picker): Collections shows its short name ("All", "Garden") in at most 40 %; search takes the rest (57 % of the bar's inner width with "All"). Extra bar buttons get 44 px auto columns, ready for slice 116's +. Browsers without the customizable select label the option "All".
- Selection bar: count and Clear are one control, "✕ 3 selected" (phones: "✕ 3"). Phones keep one 56 px row: ✕ 3, Add to collection, ⋯; ⋯ then holds Take out of <collection> and Remove files… last. Wider screens keep their row with Take out and Remove inline.
- Slice 103's newest-first order and ring are untouched.

**Commits.** cdf66bed claim; f98590bf build; 97d4dee4 light backing for whole pictures; ac60cb49 review fixes; 090b2d3b list name column fix and spec fixes; ede7ad10 light halo and closed-view unit test (rebased on 52ef812f, slice 108).

**Tests.**
- New `tests/native-save/native-media-tiles.spec.ts` (6 tests, 12/12 with `--repeat-each=2`): a 2.3 MB and a 4.4 MB JPEG tile each show an `<img>` with a 480 px copy; see-through and 3:1 pictures are `contain`, a square photo `cover`, and dark list words stay themed; list names share one x at 1280 and 390 and the number bubble is hidden; at 390 search is at least 55 % of the bar, typed words fit, the selection bar is one ≤ 56 px row (✕ 2, Add to collection, ⋯), ⋯ ends with "Remove files…", Cancel returns focus to ⋯, ✕ clears; inside a collection ⋯ offers Take out before Remove and Take out keeps the file; at 1280 Remove stays inline.
- Unit: `tests/media-tile-picture.test.ts` (copy size, 2:1 rule, no address after close); `tests/blob-endpoint.test.ts` (+3: raw stream between 3 and 20 MB, refused over 20 MB, a lengthless stream cut off and cancelled; a 2.1 MB blob read whole).
- Updated: `native-media-tab` (the ✕ control), `native-media-screen` (agent label; the list's usage column measured at its words), `tests/github.test.ts` (new return shape); the fake GitHub answers the raw form.
- After rebasing: `npm run check`, `npm run lint`, unit 3447/3447, 13 media spec files 128/128 (tiles, screen, tab, collections, library, pane, picker, touch-contrast, explorer-size, newest, numbers, rename, cleanup). Earlier, before the review fixes, 16 files ran 161 passed and 3 failed (my new spec twice, the phone long-name list spec once); all three were fixed and rerun.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-107/{before,after}/` (main checkout, not committed): 10 states × 390/768/1280 × light/dark on the real starter with a 2.3 MB and a 4.4 MB JPEG, a see-through logo, a 3:1 banner and a by-agent description: gallery, phone search typed, a collection chosen, list, selection bar, ⋯ open, plus the gallery while loading, after a load error, and the usage states (Not checked yet, Other uses found, No uses found, Used on 1 page) in tiles and list. Those last four states use a stub host mounted over the explorer (as in `native-media-screen.spec.ts`), so they hold still. `geometry.json` is in each folder. Before: the 4.4 MB JPEG is the grey icon; the phone bar gives search 34 %; the selection bar is 114 px. After: pictures everywhere; 53 % (57 % of the inner width); 56 px.

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-107/review-1`, `review-2`).
- Review 1 accepted choices 1–6 and found 3 P2s, all fixed: whole-picture dark glyphs also hit list rows; the native select still read "All collections"; a late tile copy made an unreleased address. Its gaps were added as tests: lengthless over-limit stream, dark list words, phone Take out.
- Review 2: no defects. Its one gap (closing during encoding) was added as a unit test.
- Not added: a native-select browser test (Chromium cannot turn off base-select).
- Rejected: none. Both runs note a nested `codex exec` that failed on the read-only sandbox, which is harmless.

**Bytes.** Boot is unchanged: 348 KB before first preview paint on origin/dev 52ef812f and on this branch (index.js 226 KB, index.css 20 KB). The new code sits in the lazy media chunk and the Worker.

**Follow-ups.**
- Slice 116: adding a 44 px + beside More leaves search about 40 % of the phone bar with "All" (the 55 % figure holds without it). With a long collection name, search keeps at least 40 % less the buttons.
- The ticket names that state "Other uses found"; the shared label stays "0 pages · Other uses found" (tile hover and list), which slice 108's usage wording may revisit.
