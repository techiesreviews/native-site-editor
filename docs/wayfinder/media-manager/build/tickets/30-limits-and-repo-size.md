---
title: Limits, warnings and repo size
type: task (AFK)
status: closed
assignee: claude (mm-30 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 2
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Limits and failures"; research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §8.

- Hard cap: 20 MiB per stored file (`/api/blob`); a larger source may be prepared first.
- **Large download** note above 1,000,000 bytes for images and 10,000,000 for video, audio and other downloads; adding continues.
- If preparation fails, ask before adding the unchanged file only when it suits a website and fits the cap; otherwise give format advice.
- Repo size: shown in Adding settings ★, with warnings at 500 MB and 900 MB (GitHub Pages stops at 1 GB).

## Done when

- `tests/media-limits.test.ts`: cap, both warning sizes in decimal bytes, the failure rules, repo size thresholds.

## Done (2026-10-14)

- **Behaviour.** New lazily loaded pure module `src/page-builder/media-limits.ts` holds the rules; `media-prepare.ts` applies them for every way of adding.
  - **Cap.** The exact existing 20 MiB (20,971,520 bytes, labelled 20 MB) per stored output. A larger raster source is still prepared first; only stored outputs are capped.
  - **Large download note.** Strictly above 1,000,000 bytes for images and 10,000,000 bytes for video, audio and other downloads (decimal), judged on each added file's largest stored output, prepared or as-is: "Large download: holiday.webp is 1.4 MB, which can be slow to load on phones." Sizes in the note are decimal MB, so a file just over 1 MB never reads "977 KB". Adding continues. It replaces the old 2 MiB "heavy for a web page" warning in the adding path only (`uploadWarning` and the Optimise heavy images finder are unchanged).
  - **Failed preparation.** The unchanged file is offered with a question ("Add unchanged file?", **Add unchanged** / **Don't add**) only when it suits a website (jpg, png, webp, avif, gif, svg, ico, mp4, m4v, webm, mp3, m4a, aac, wav, PDF and other downloads), fits the cap, this browser can show it (pictures), and no required clean-up would be skipped. Otherwise plain advice: the 20 MB limit; HEIC/HEIF/TIFF/BMP → save as JPEG or PNG; MOV/MKV/AVI/OGV → export as MP4 (H.264); FLAC/AIFF/OGG/OPUS/WMA → export as MP3 or M4A; hidden personal details; SVG scripts. Required clean-up cannot be bypassed: `mayHoldHiddenDetails` passes only known picture, colour and layout blocks (JPEG: SOF/DHT/DQT/SOS/DRI, APP0 only as an exact JFIF header, APP2 only as an ICC profile, APP14 only as the 12-byte Adobe header, nothing after the end marker; PNG and WebP: allow-listed chunks); anything else, unknown formats and broken bytes count as personal details. `svgHasExecutableContent` refuses scripts, `on…=` handlers, `javascript:`, `foreignObject`, `iframe`, `embed`, `object`. "Don't add", Cancel and Escape add nothing; the other files still go in. One shared dialog (`media-preparation-confirm.ts`, loaded only when needed) asks one question at a time for both the Media pane and Files/picker adding; `confirm-dialog.ts` gains an optional cancel label.
  - **Repo size.** The worker's repository listing now carries GitHub's `size` (KiB) into `Repository.size` (absent for local folders). `repoSizeStatus(size)` gives bytes, a decimal label ("512 MB", "1.1 GB") and a level: `ok`, `large` at 500,000,000 bytes, `near-limit` at 900,000,000, with a plain message (GitHub Pages stops at 1 GB; history keeps removed files). No UI yet: slice 26 shows it in Adding settings.
- **Commits.** d7c4ec40 claim; 9fa6e8ba build (Sol); 83e29aa1 review 1 fixes; 6bc7e110 review 2 fix; close.
- **Tests.** New `tests/media-limits.test.ts`: cap at 20,971,520 / +1; notes at 1,000,000 / 1,000,001 and 10,000,000 / 10,000,001 per kind, decimal text; every failure rule (suitable formats ask, each unsuitable family's advice, over cap, JPEG Exif/IPTC/comment/unknown APPn/MPF APP2/odd JFIF or Adobe payloads, PNG text and unknown chunks, WebP EXIF/XMP and unknown chunks, broken bytes, SVG executable content, a picture the browser cannot show); repo size thresholds and labels. `tests/media-prepare.test.ts`: consent yes/no/missing, cancel during the question, no question for unsafe or unshowable pictures, notes on the largest output and as-is PDFs, a source over the cap prepared below it. `tests/github.test.ts` and `tests/repository-cache-runtime.test.ts`: `size` in the listing and its cache. Ran: `npm run check`, `npm run lint`, unit 2546/2546; touched browser specs (media adding, upload, media collections, media picker) 31/31, twice.
- **Review (GPT-6.1 Sol), 3 rounds.** Evidence: `.scratch/reviews/mm-30/round-{1,2,3}/` (result.md, run.log) in the main checkout. Round 1, fixed: a JPEG comment block could carry personal details past the offer (P1; now an allow-list for JPEG, PNG and WebP blocks); an undecodable picture could be offered (P2; now only when the browser can show it). Round 2, fixed: APP0/APP14 were allowed by marker alone (P2; now only in their standard shape). Round 3: no defects. Nothing rejected.
- **Validation gap.** No browser test drives the consent dialog itself (accept adds once, refuse/Escape adds nothing); the rule and the consent flow are unit tested. Slice 31, which builds the shared progress summary, is the natural place to cover it.
- **Bytes.** `test:budget`: 342 KB gzip before first preview paint of 355 KB (unchanged). Boot entry JS +45 B gzip (the lazy `askToAddUnchanged` hand-off in `main.ts`); CSS unchanged; the rules, dialog hand-off and review fixes are in lazy media chunks.
- **Follow-ups.** Slice 26: show `repoSizeStatus(appStore.repository.value.size)` in Adding settings. Slice 31: show Large download notes, advice and the "was not added" lines in the shared progress summary; may fold the consent question into it. Slice 29: today SVGs are still stored as they are; its SVG clean-up should use the same executable-content rule so a script-bearing SVG is never stored. Slices 57/58 (video, audio): when they prepare files, run their failures through `preparationFailure` and decide whether phone video location data needs the same no-bypass rule.
