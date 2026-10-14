---
title: Audio preparation; PDF first-page previews
type: task (AFK)
status: closed
assignee: claude (mm-58 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 5
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Audio" and "PDFs and other downloads".

- MP3/AAC below 160 kbps that fit the cap are kept unchanged, whatever the setting. Others become AAC-LC M4A: Balanced 96 kbps, Higher quality 128 kbps (mono/stereo kept), Speech 64 kbps mono only when chosen. Files over the cap are tried first, then refused if still over. Lossless M4A is not "already compressed".
- PDFs and other downloads keep their bytes. PDFs get a first-page preview (pdf.js, on demand) in the family; other downloads get a file-type picture.
- Audio and PDFs go to `media/audio/` and `media/downloads/`.

## Done when

- `tests/audio-prepare.test.ts`: the 160 kbps rule, each preset, Speech only when chosen, over-cap path.
- `tests/pdf-preview.test.ts`: preview made, PDF bytes unchanged.
- Byte budget: boot delta zero.

## Done (2026-10-15)

- **Behaviour.** Every way of adding (Media pane, picker, Files drops and Upload files…) prepares audio and PDFs through `prepareMediaFile`.
  - **Audio** (`mp3 m4a aac wav ogg oga opus flac`). MP3 or AAC in an MP3, MP4/M4A or ADTS file, strictly below 160,000 bit/s (Mediabunny's packet stats, else size ÷ duration) and within the 20 MiB cap, keeps its bytes whatever the setting, Speech included. Lossless audio in an `.m4a` (ALAC, FLAC, PCM) is never "already compressed". Everything else becomes AAC-LC M4A in `media/audio/`: Balanced 96 kbit/s, Higher quality 128 kbit/s (mono stays mono, stereo stays stereo, more than 2 channels → 2), Speech 64 kbit/s mono only when chosen. A keep-eligible file over the cap is converted first and refused with the cap message if still over. Converted files carry no tags or cover pictures. The site's remembered audio choice (slice 26) reaches every caller.
  - **Where it runs.** Conversion runs in its own module worker (`audio-prepare.worker.ts`) with Mediabunny. With Mediabunny in the page's chunk graph, the bundler re-split shared boot code (+3 KB boot), so it stays out of it. Cancelling stops the worker.
  - **Browsers without an AAC encoder.** Firefox and open-source Chromium (Playwright's) have none (probed with `AudioEncoder.isConfigSupported`). There, the existing failure path applies: "Add unchanged?" for WAV/MP3/M4A/AAC within the cap, otherwise the "export as MP3 or M4A" advice. A WASM fallback is not included (see Follow-ups).
  - **PDFs.** Bytes unchanged (the stored blob is the incoming file; pdf.js gets a copy). The cap is checked first. A `.pdf` starting with `%PDF-` gets a first-page WebP preview from pdf.js, loaded on demand: white background, fitted within 960 × 1440 px, never enlarged, 30 s limit, cancellable. The preview sits beside the PDF with the same base (`media/downloads/report.pdf` + `report.webp`), linked as the record's `still` in the same Undo step, using slice 57's still storage (now accepting a video or a PDF). If the preview fails (encrypted, broken, timeout, module load), the PDF is still added unchanged with "<name> was added without a preview picture." Other downloads are stored as before; slice 59 draws their file-type picture.
  - **pdf.js decoding data.** `vite-pdfjs-assets.ts` copies pdf.js's CMaps, standard fonts, WASM image decoders (JPEG 2000, JBIG2, colour) and ICC profiles, with their licence files, to `assets/pdfjs-<version>/` (dev and test servers serve the same paths). The preview passes `cMapUrl`, `standardFontDataUrl`, `wasmUrl` and `iccUrl`. The QuickJS sandbox (scripts inside PDFs) is left out.
  - **Keep original** is not applied to audio, as slice 57 does for video.
- **Licences.** `pdfjs-dist` 6.4.299: Apache-2.0 (its bundled WASM decoders' licence files ship beside them in `assets/pdfjs-6.4.299/wasm/`; standard fonts carry `LICENSE_FOXIT`/`LICENSE_LIBERATION`). Its optional Node-only `@napi-rs/canvas` 1.0.11 (MIT) is in the lock file but never bundled. `mediabunny` 1.61.4: MPL-2.0 (already added by slice 57).
- **Commits.** 46d47e74 claim; c03d6468 build (Sol, plus the runner's audio worker; rebased over slice 57, keeping its video branch and still storage); f89ad7dc review fix (pdf.js decoding data); a0601626 slice 57's converted-GIF spec opens the picker by double-click (it used the Edit bar's Choose image…, removed by slice 39; failed on dev); bffca77f review round 2 browser rows; this close.
- **Tests.** New `tests/audio-prepare.test.ts`: the 160 kbps rule (159,999 keep, 160,000 convert; MP3/AAC keep; ALAC/FLAC/PCM in `.m4a`, Opus, Vorbis, WAV convert); each preset with mono, stereo and 6 channels; Speech only when chosen and never over a small MP3; the over-cap path (converted, then refused if still over); a fake Mediabunny for keep, convert (recipe, no tags, no cover track), no AAC encoder, cancel; the chosen quality reaching the recipe and `media/audio/<name>.m4a`. New `tests/pdf-preview.test.ts`: the asset URLs pdf.js receives; the size rule; WebP preview made; PDF bytes unchanged while pdf.js transfers a copy; no pdf.js for other downloads, a `.pdf` without `%PDF-`, or over the cap; failures, timeout and non-WebP add unchanged with the note; abort cancels; the workspace stores `report.pdf` + `report.webp` in one batch with the `still` link and numbers conflicts together. Updated `media-prepare`, `media-originals`, `media-settings`, `frame-guard` (the audio worker's messages). Browser (`native-upload.spec.ts`): a valid one-page PDF committed byte for byte with a `RIFF…WEBP` preview beside it and one file from each pdf.js data folder served; a 128 kbps MP3 committed unchanged in `media/audio/`. `native-media-adding.spec.ts`: the held pdf.js worker released in time (preview added), cancelled while held (nothing added, the late preview writes nothing), and held past the 30 s limit (PDF added with the note, no preview). The PDF fixture moved to `tests/native-save/pdf-fixture.ts`. Real AAC conversion has no browser test: no test browser can encode AAC.
  - Ran: `npm run check`, `npm run lint`, unit 2934/2934; upload, media adding, picker and pane specs 49/49 on the final branch.
- **Review (GPT-6.1 Sol), 2 rounds.** Evidence: `.scratch/reviews/mm-58/round-{1,2}/` (result.md, run.log; model gpt-6.1-sol, sandbox read-only) in the main checkout.
  - Round 1, fixed: pdf.js lacked its decoding data, so scans, CMap text or unembedded fonts could give an empty preview (P2; f89ad7dc). Gaps: browser rows for the held preview (added in round 2's follow-up).
  - Round 2: no defects; the fix verified. Gap: the held-preview race rows, added in bffca77f.
  - Rejected gaps: a real AAC browser test (no test browser has an AAC encoder; probed); a JPEG 2000 scan fixture (no JPEG 2000 encoder available here; the URLs are unit tested and each folder is fetched in the browser test).
- **Bytes.** Same-sitting `test:budget` against origin/dev 6abb9a80: 347 → 347 KB gzip before first preview paint (budget 355 KB). Boot entry JS 239,246 → 239,248 B gzip (+2 B); neither pdf.js nor Mediabunny is reachable from boot. Lazy: pdf-preview 1,917 B gzip; pdf.js 127,321 B gzip + its worker 374,651 B gzip; audio worker 1,215 B gzip + Mediabunny 169,551 B gzip; pdf.js decoding data 3.6 MB in 198 files, fetched only as a PDF needs them. Sol's build added a global code-splitting group to `vite.config.ts`; removed in favour of the audio worker.
- **Follow-ups.**
  - Lead decision: `@mediabunny/aac-encoder` 1.61.4 (MPL-2.0 wrapper around FFmpeg's AAC encoder as WASM, LGPL-2.1+, with the AAC patent question) would let Firefox and Linux Chromium convert audio. The seam is `AudioPrepareDeps.aacFallback`.
  - Slice 59: put PDF previews (and video stills) into families, so Clean up never lists `report.webp` on its own as unused, and show PDF tiles from the `still` link.
  - Slice 27 / later: Keep original for audio (and video) under ticket 07's "same rule for all changed media".
  - Third-party notice file for Apache-2.0 / MPL-2.0 code in the build (also noted by slices 28 and 29).
  - Real Safari and iPhone: AAC conversion speed and the PDF preview (spec "Safari and phones").
