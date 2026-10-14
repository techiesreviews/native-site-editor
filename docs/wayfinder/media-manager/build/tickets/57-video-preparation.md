---
title: Video preparation; GIF becomes a looping video
type: task (AFK)
status: closed
assignee: claude (mm-57 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 5
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Video" and the preset mappings; research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §4–5.

- Mediabunny (loaded on demand) to H.264 MP4: Smaller fits 1280 × 720 (or 720 × 1280), Balanced 1920 × 1080 (or 1080 × 1920), both medium quality; Higher quality at source size, high quality. AAC 128 kbps for an existing sound track; never invent one. Never enlarge.
- A WebP still picture from the video, in the family.
- Firefox on Android cannot encode: the file is added as it is if under the cap.
- **Animated GIF** becomes a silent looping H.264 MP4 in `media/videos/`, treated as video (ends slice 25's "kept as is").

## Done when

- `tests/video-prepare.test.ts`: preset sizes for landscape and portrait, never enlarged, sound kept or absent, GIF to MP4 path, unsupported-encoder fallback.
- Nightly in `native-media-adding.spec.ts`: add a short MP4 and an animated GIF; both arrive as MP4 with stills.
- Byte budget: boot delta zero.

## Done (2026-10-14)

- **Behaviour.** Videos (`mp4 m4v webm mov mkv ogv avi`, or a `video/*` type) and animated GIFs go through one lazily loaded module, `src/page-builder/video-prepare.ts`, from `prepareMediaFile`; pictures keep the image worker path. It loads Mediabunny on demand and uses the browser's own WebCodecs encoders.
  - **Presets** (`videoTargetSize`, display size after rotation, rotation baked in): Smaller fits 1280×720 (portrait 720×1280; square uses the landscape box), Balanced 1920×1080 / 1080×1920, both `QUALITY_MEDIUM`; Higher quality keeps the source size at `QUALITY_HIGH`. Aspect kept, never enlarged, even sizes (H.264 4:2:0). Output H.264 MP4 in `media/videos/`. The site's remembered video choice (slice 26) now reaches preparation from the Media pane, picker, Files drops/Upload files… and Replace.
  - **Sound.** An existing track becomes AAC 128 kbps (`new Quality({ bitrate: 128_000 })`) when the browser can encode AAC. Firefox, Chromium on Linux (and Playwright's Chromium) cannot: an AAC track is then copied unchanged, and other sound fails into slice 30's flow ("Add unchanged?" for mp4/m4v/webm under the cap, else "Export it as MP4 (H.264)"). Sound is never dropped (any discarded track fails); no track is ever invented. No metadata tags are copied (`tags: () => ({})`), so phone location tags do not reach the site.
  - **Still.** A WebP still (quality 80, through slice 28's `createMediaEncoder`, so Safari gets real WebP) at the video's output size: about 1 s in, or the middle of clips under 2 s; a GIF's first frame. Saved beside the video with the same base (`media/videos/holiday.mp4` + `holiday.webp`), reserved with the family by `chooseMediaPath({ still })` so `-2` numbering covers both, and recorded as `files[<mp4>].still` in the same records edit: one Undo removes video, still and record. The cap covers the still too.
  - **Animated GIF** becomes a silent H.264 MP4 (ImageDecoder frames → Mediabunny `CanvasSource`, the video choice's box, never enlarged), treated as a video, recorded `fromGif: true` (new optional flag in `MediaFileRecord`, validated) so slice 64 can start it looping. Each frame is drawn on a cleared white canvas (H.264 has no transparency; avoids trails from earlier frames). Delays of 10 ms or less play at 100 ms, as browsers show them. A still GIF still follows the image recipe.
  - **Browsers that cannot encode** (no WebCodecs, `canEncodeVideo('avc')` false, e.g. Firefox on Android): a suitable video under the cap is added as it is with "This browser cannot prepare videos, so clip.mp4 was added as it is."; other formats get slice 30's advice. An animated GIF without `ImageDecoder` or H.264 stays a GIF with "This browser cannot turn animated GIFs into videos, so loop.gif was added as it is."
  - **Picker.** The held-file "fits this spot" check and Use go by the stored output's name: a GIF prepared to MP4 is never chosen for an image spot ("This file does not fit this spot. Close to save it without placing."). Pending names predict `.mp4` for videos. `avi` counts as video in Media's kinds.
- **Dependency and licence.** `mediabunny` 1.61.4 (pinned), with `@types/dom-webcodecs` 0.1.13 and `@types/dom-mediacapture-transform` 0.1.12; the lead added them to the shared `node_modules`. Mediabunny is **MPL-2.0**, used unmodified. MPL-2.0 is file-level copyleft: only changes to its own files would have to be shared; using it from the MIT editor is fine, and its notice and source (public on npm/GitHub) must stay available with redistributed copies (no third-party notice file ships yet; same follow-up as slices 28/29). `vite.config.ts` aliases `mediabunny` to its prebuilt ES bundle (Sol: the ES modules otherwise split shared helpers into new boot chunks) and prebundles it for the dev server.
- **Commits.** 50debbd7 claim; af427602 build (Sol, with the runner's fixes: the AAC bitrate as a Mediabunny `Quality`, since a plain number throws "must be a Quality" and would have failed every video with sound on Chrome for Windows/Mac and Safari; white, cleared GIF frames; the GIF delay rule); b2ee5252 review fixes; this close.
- **Tests.**
  - New `tests/video-prepare.test.ts` (fake Mediabunny/ImageDecoder/encoder): preset boxes for landscape, portrait and square per choice, small and odd sizes, never enlarged; rotation uses display size; Higher keeps size at high quality; AAC 128 kbps as a `Quality`; AAC copied without an encoder, other sound fails; silence stays silent; discarded/invalid conversions fail; metadata tags empty; still time and quality; GIF to timed silent MP4 with first-frame still, white fills and `fromGif`; GIF delay rule; unsupported encoder (as is with the note, MOV advice, cap, GIF kept with its note); cancel for video and GIF; broken GIF fails.
  - `tests/media-prepare.test.ts`: video routed lazily with the video quality, still saved numbered with its record in one Undo; video errors use the unchanged question; the cap includes the still. Also `media-records`, `media-adding-rules`, `media-files-adding-runs` unit tests.
  - Nightly in `native-media-adding.spec.ts`: an MP4 with a real AAC-LC track (made in the page) and an animated GIF added in Media arrive as `media/videos/clip.mp4`/`loop.mp4` (`ftyp`, `avc1`) with WebP stills and `still`/`fromGif` records; after publishing, the clip's AAC track decodes (stereo) and the GIF's video has no sound. A converted GIF cannot be chosen or used in an image picker; Close saves it unplaced.
  - Ran: `npm run check`, `npm run lint`, unit 2,855/2,855; adding, upload, picker, library and pane specs 58/58, then the two video tests again after the review fixes. Mediabunny's real option validation checked in Node (number refused, `Quality` accepted).
- **Review (GPT-6.1 Sol), 1 round.** Evidence: `/home/ubulex/Projects/native-site-editor-build-mm-57-video-preparation/.scratch/review/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`), copied to the main checkout's `.scratch/reviews/mm-57/`.
  - P2, partly accepted: an animated GIF kept as it is when the browser cannot decode GIFs was silent. Now it gets a plain note. Rejected the "ask first" part: this is the policy's browser-cannot-encode exception (research 02; ticket 57 "added as it is if under the cap"), the GIF still works as a picture, and slice 25 kept animated GIFs as they are without a question.
  - Gap closed: a browser test with a real AAC track (above). Gap not applicable: accept/refuse tests for the GIF question, since there is no question.
  - No re-review: the fixes were a note and tests.
- **Bytes.** `test:budget` on the final branch: 339 KB gzip before first preview paint of 355 KB. Sol's same-sitting build: boot entry 238,344 → 238,353 B gzip (+9 B, the `fromGif` check in the shared records parser), so not exactly zero; `dist/index.html` and the boot entry do not reference Mediabunny. Lazy: `mediabunny` 682,966 B / 169,427 B gzip (the whole prebuilt bundle, every format), `video-prepare` 6.7 KB.
- **Follow-ups.**
  - Lead decision: `@mediabunny/aac-encoder` (FFmpeg's AAC encoder as WASM inside an MPL-2.0 wrapper, LGPL code, about 260 KB gzip, lazy) would let Firefox and Linux Chromium turn non-AAC sound (Opus/Vorbis WebM, PCM MOV) into AAC instead of offering the file unchanged. Same licence class as the parked HEIC decoder.
  - Slice 59: group the still into the video's family (today `holiday.webp` lists as its own picture, and Clean up may suggest it as unused until then); open the Media pane/picker file chooser to video (today `image/*,.heic,.heif`; drops and Files → Upload files… already take videos).
  - Slice 64: start `fromGif` videos looping.
  - Slice 27 / ticket 07 "Originals": Keep original for video is not implemented (a video added with Keep original on gets no original).
  - Slice 30's question for phone video location data: prepared videos carry no metadata tags; a video added as it is (browser cannot encode) keeps whatever it had.
  - Possibly smaller lazy chunk: import only the MP4/MOV/WebM/Matroska input formats instead of `ALL_FORMATS` with tree-shaken ES modules, if the boot chunk split can be avoided.
  - Real Safari, Chrome on Windows/Mac (native AAC) and phone encoding speed are unverified here (spec "Safari and phones").
