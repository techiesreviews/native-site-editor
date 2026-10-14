---
title: The image recipe - presets, copies, never larger
type: task (AFK)
status: closed
assignee: claude (mm-25 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Images" and "Confirmed preset mappings"; today's worker `src/page-builder/media-optimise.ts` and `image-optimise.worker.ts`.

- Presets: Smaller files (WebP q70 ≤ 1,600), **Balanced** (WebP q80 ≤ 2,400, default), Higher quality (WebP q90, source size), Smallest files (slower) (AVIF q50 speed 8 ≤ 2,400, encoder in slice 28).
- Never enlarge. Transparent images compare WebP at the ordinary quality with lossless PNG and keep the smaller; under AVIF use the Balanced comparison.
- If preparing makes the main image larger, keep the smaller suitable version (JPEG/PNG where right), comparing only versions with the chosen size and personal details removed.
- Copies at 480, 960, 1,600, only below the main width, with the selected recipe, named `-480` (slice 24).
- Location and camera data dropped from every output.
- A non-animated GIF follows the still-image path; an animated GIF is kept as it is until phase 5 ★.

## Done when

- `tests/media-optimise.test.ts` extended: each preset's mapping, never larger, transparency, the smaller-eligible rule, copy widths, animated GIF untouched.
- `native-media-adding.spec.ts` nightly: a 3000 px JPEG becomes a 2400 px WebP with three copies.

## Done (2026-10-14)

- **Behaviour.** Adding no longer uses the stored Optimise settings: `prepareMediaFile`/`prepareMedia` take an image quality as their last argument (`"balanced"` by default; slice 26 passes the remembered choice) mapped by `mediaImageRecipe` to ticket 07's values: Smaller files WebP 70 ≤ 1,600; Balanced WebP 80 ≤ 2,400; Higher quality WebP 90 at source size (`maxWidth: null`); Smallest files (slower) AVIF 50, speed 8, ≤ 2,400. Never enlarged.
  - **Transparency.** Transparent pictures keep the smaller of WebP at the ordinary quality and lossless PNG; under AVIF they use the Balanced comparison.
  - **Never larger than needed.** If the main is larger than the source *after its personal details are removed*, the smallest suitable version wins (`mediaSmallerMain`): the source with metadata stripped losslessly (JPEG APP1/APP13/COM, PNG `eXIf`/text/`tIME`, WebP `EXIF`/`XMP `; ICC kept), only when it already has the chosen size and is upright (EXIF orientation absent or 1); a JPEG for opaque pictures; a lossless PNG for opaque PNG/GIF/BMP sources. Extra encodes only when needed. Every other output is a canvas encode, so no location or camera data reaches the site.
  - **Copies.** 480/960/1600 below the main width, at the recipe's quality in the main's chosen format (the import batch and family names need one extension per family), kept only when smaller in bytes than the main.
  - **GIF and animation.** A still GIF is prepared like any picture (`mediaFileNeedsPreparation` reads a GIF's bytes; slice 24's name-only `mediaNeedsPreparation` is unchanged and still predicts pending names); an animated GIF stays exactly as it is (phase 5). Animated PNG and WebP keep every frame with their personal-detail chunks removed, or are refused with a plain message when that cannot be done safely.
  - **Hooks.** One `encode(canvas, type, quality, speed)` seam in the worker for slice 28's AVIF/Safari encoders; until then AVIF falls back to Balanced WebP with a note, and a browser returning PNG for WebP is accepted as today. HEIC and SVG handling unchanged (slice 29). The Optimise heavy images dialog keeps its own width/quality/format and gains the same never-larger rule.
  - **Visible change.** Small flat graphics (logos, icons) now stay PNG when that is smaller than WebP; four browser specs that expected `.webp` for tiny PNG fixtures were updated.
- **Commits** (after rebasing over slices 24, 30, 31, 86 and 87): 5c0c232b claim; c583b482 build (Sol); 30ebe764 review round 1 fixes; 70434242 review round 2 fix; 88fedecf collections specs; then the close. The rebase merged the recipe into slice 30's failure questions in `media-prepare.ts` (a refused animated PNG/WebP still gets slice 30's hidden-details advice, never the unchanged-file question) and slice 24's `media/images/` paths in the specs.
- **Tests.** `tests/media-optimise.test.ts`: each preset's mapping, unlimited Higher quality, never enlarge, transparency incl. AVIF, the smaller-suitable rule (stripped source vs raw size, JPEG and PNG fallbacks, transparent skips), copy widths and byte gate, metadata stripping for JPEG/PNG/WebP (orientation, malformed input), animation detection, animated PNG/WebP stripping and refusal, a faked-canvas worker run. `tests/media-prepare.test.ts`: Balanced ignores stored Optimise settings, animated GIF untouched, still GIF prepared, quality passed through. `native-media-adding.spec.ts` nightly: a 3000 px JPEG becomes `media/images/recipe.webp` at 2400 px with `-480`/`-960`/`-1600` copies, checked in the saved repository. `native-media-library.spec.ts` real worker: a JPEG and a PNG kept stripped (no GPS, identical pixels); an APNG keeps its frames; transparency in main and copies; an EXIF orientation 6 photo comes out upright without its location. `frame-guard` worker count 4 → 5.
  - Ran before the rebase: unit 2543/2543; touched specs (adding, library, upload, picker, collections, media tab) 72/72; full suite 957 passed, 3 failed (`native-code-folding.spec.ts:26` passed on rerun, unrelated; two `native-media-collections` `.webp` → `.png` expectations, fixed).
  - Ran after rebasing over slices 24, 30 and 86: `npm run check`, `npm run lint`, unit 2601/2601; full suite 967 passed, 0 failed, 60 skipped. After rebasing over slices 31 and 87: unit 2613/2613; media specs (adding, library, upload, picker, collections, media tab, media screen, action fades) 106/106.
- **Review (GPT-6.1 Sol), 3 rounds.** Logs (run.log and result.md per round): `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-25/{review-1,review-2,review}/`.
  - Round 1, fixed: the larger-than-source check used the raw size, missing a smaller stripped JPEG (P2); resized opaque PNGs had no lossless PNG candidate (P2).
  - Round 2, fixed: animated PNG/WebP were kept with their personal metadata (P2); real-worker tests added for transparency, orientation 6 and APNG.
  - Round 3, rejected: "copies must exist at every width below the main, even when larger in bytes than the main" (P2). A copy larger than its main makes small screens download more than the full image, against "never larger than needed" and the lead's "only when smaller"; ordinary photos still get all three (the 3000 px spec). The lead can overrule by deleting `mediaCopyIsSmaller`.
  - Validation gap left: no real two-frame APNG/animated WebP fixture; stripping removes only metadata chunks and keeps frame chunks byte for byte (unit tested), and a one-frame APNG decodes identically in the real worker.
- **Bytes.** Boot ±0: same-sitting `test:budget` before the rebase 342 → 342 KB gzip before first preview paint (budget 355 KB); after the rebase 344 KB, the growth coming from slices landed meanwhile (this slice changes only the worker, the lazily loaded `media-optimise`/`media-prepare`/`media-image-bytes` modules and one comment in `media-storage.ts`).
- **Follow-ups.** `mediaAddingPath` (slice 17/24) still predicts `.webp` for a pending PNG that may end up PNG; only the pending tile's name is affected. Slice 26: pass the remembered quality to `prepareMedia`. Slice 28: the AVIF encoder and Safari WebP behind `encode`. Slice 33: copies follow the main's format, so a JPEG/PNG main has JPEG/PNG copies.
