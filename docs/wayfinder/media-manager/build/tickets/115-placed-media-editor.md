---
title: Placed video, audio and downloads in the editor: plain words, real times
type: task (AFK)
status: closed
assignee: claude (mm-115 runner)
blocked_by: [105-editor-toast]
builder: claude
phase: 8
---

## What

From the [UX and UI audit](../ux-ui-audit.md#video-audio-download-and-online-video-placement-b-29-to-b-33).

- The video edit bar says "Video file", "Still picture" and "Title" instead of "Video URL", "Poster URL" and "Title" (`native-element-fields.ts:82`).
- The canvas audio shows its real length (`preload="metadata"`), not "0:00 / 0:00".
- The canvas hover tag over a download card says "Download", not "span.download-card-meta".
- At 1280 the edit bar sits above a selected video when there is room, and the hover outline follows the video's box.

## Done when

- Also shot (not in the audit's sets): visitor subtitles with CC on, the audio transcript, the looping video's corner pause button, and an Online video playing and its fallback when the provider is blocked.
- Specs for the bar labels and the canvas audio duration.
- Shots of every screen this slice touched at 390, 768 and 1280, light and dark, before and after, on the real starter (`scripts/agents/shots.sh`).
- `npm run check`, `npm run lint`, unit tests, the touched browser specs; new code stays in the lazy media chunk (boot budget unchanged).
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

**Behaviour.**
- The video's edit bar reads **Video file**, **Still picture** and **Title** (`native-element-fields.ts`); results and errors follow ("Video file changed"). Wording only, so slice 119's single Media button can take these over.
- The canvas audio shows its real length. The canvas may only play `blob:` media, so a bare `preload="metadata"` could not load a repository file there. Instead, the files of the page's `<audio>` and `<source>` elements ride the image asset pipeline (`main.ts` `loadNativeAssets`: drafts, uploads, missing files). Plain links to a recording are not read, and neither is a file over 10 MB (`CANVAS_AUDIO_MAX_BYTES` in `shared/asset-types.ts`): a longer recording shows its length once played. The runtime turns each file into one `blob:` address with `preload="metadata"`. That covers an audio's own `src` or its first `<source>`, keeps the length after Play and Stop (also when the file arrived while it played), and reloads when a render changes a `<source>`. Video is unchanged (still picture, no bar).
- The hover tag over a download card, or any part of it, says **Download**, and over an Online video it says **Video**. One rule (`page-builder/rules/media-cards.ts`) is shared by the canvas, the edit bar and Page structure (`nativeKindLabel`).
- An element chosen in Page structure or the code, or just added, is revealed under the site's sticky header with room above it for the edit bar (`rules/reveal.ts`, `EDIT_BAR_ROOM` 76 px: the bar with its name tab is about 60 px). So at 1280 the bar sits above a chosen video instead of covering its top. Without that room plus 120 px of the element (a phone's 150 px canvas), it goes just under the header as before. Scrolling boxes on the page scroll the nearest way first, vertically and sideways, as `scrollIntoView` did.
- The plain video's hover outline already followed its box (a spec now asserts it). The audit's wide purple outline in B-29 at 1280 was not a hover box and could not be reproduced by hovering.

**Commits.** 6e8f29b5 claim; d3eab032 build; 7feab200 review fixes; f28fdc81 re-review fixes.

**Tests.**
- Unit tests: `tests/rules-media-cards.test.ts`, `tests/rules-reveal.test.ts` (each revealed case is checked against `editBarPlacement`), the video field labels in `native-element-fields.test.ts`, and `audioType` in `blob-endpoint.test.ts`. Unit run: 3447/3447.
- New `tests/native-save/native-placed-media.spec.ts` (9 tests): canvas audio length, plus after Play and Stop; a `<source>` audio; a file arriving during Play; a `<source>` switched to a file already read (red without the reload); bar labels; the Download hover tag; at 1280 the bar above a video chosen in Page structure and the hover outline on its box; videos in vertical and horizontal scrolling boxes. `native-fields-host.spec.ts` uses "Video file".
- Full native-save suite on d3eab032 (3 shards): 1071 passed, 2 failed. `native-image-popup.spec.ts:462` (the Edit image dialog's "Undo" now matches two buttons, slice 105's toast Undo) fails the same way on the dev base 36a06637, so it is not this slice. `native-setup-wizard.spec.ts:362` passed on rerun (flaky).
- On the final code: the 28 touched spec files (canvas, structure, edit bar, media video and numbers, placed media), 192 passed; the `@actual` group, 58 passed. check and lint pass.

**Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-115/{before,after}/` on the real starter (`origin/dev` c597698), at 390, 768 and 1280, light and dark. The page is seeded with a video with subtitles, a 41.9 s WAV with a transcript, a PDF card, a Vimeo card and a looping video.
- Editor: canvas audio and Download hover; video hover; bar on a selected video; video chosen in Page structure.
- Visitor: CC on, transcript, the looping video's corner pause button, Online video playing (a stand-in page for player.vimeo.com; the service is never contacted) and blocked.
- Before: "0:00 / 0:00" and "span.download-card-meta", and at 1280 the bar over the video's top. After: "0:00 / 0:41", "Download", and the bar above the video. At 390 the canvas is too short, so the bar still pins (Q3).

**Review.** GPT-6.1 Sol, read-only (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-115/review-1`, `review-2`).
- Review 1, three P2s, all fixed in 7feab200 with browser tests: `<source>` audio, a file read during Play, and scrolling boxes.
- Review 2, two P2s, both fixed in f28fdc81 with browser tests: a cached `<source>` change not reloading, and sideways scrolling.
- Rejected 0.

**Bytes.** First paint is 348 KB before and after (budget 355). The boot entry is +0.14 KB gzip (audio typing and the 10 MB cap in the asset loader). The canvas runtime (its own file, not boot) is +0.61 KB gzip.

**Follow-ups (starter, seen in the visitor shots).**
- At 1280 the video's subtitle line sits behind the site's control bar (05-visitor-video-subtitles).
- A blocked Online video shows a blank white frame and no fallback (09-visitor-online-blocked).
- `native-image-popup.spec.ts:462` needs its Undo locator scoped away from the toast (slice 105).
