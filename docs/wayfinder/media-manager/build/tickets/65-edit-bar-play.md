---
title: The edit bar's play button
type: task (AFK)
status: closed
assignee: claude (mm-65 runner)
blocked_by: [62-player-markup]
builder: claude
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "In the editor": on the canvas everything stays still; a play button in the edit bar checks playback, YouTube and Vimeo included; looping videos stay still until played.

- Play and stop from the edit bar on a selected video, audio or Online video; stopping returns to the still.

## Done when

- Nightly in `native-media-video.spec.ts`: select a video, press play, it plays in the canvas; press again, it stops.

## Done (2026-10-15)

- **Behaviour.** A selected video, audio or Online video (`<a class="online-video" href>`, slice 61's markup) has one **Play** button in the edit bar (play icon); it reads **Stop** while playing. Nothing is written to the page. Background videos get Play too; the canvas still keeps every video and audio still (no autoplay, `preload="none"`, paused; videos without controls), so a click selects.
  - **Site video and audio** play in place on the canvas: the editor reads the file (drafts first, then the branch) and posts its bytes as a Blob to the sandboxed canvas, which plays them from a blob: address of its own (slice 56's `media-src 'self' blob:`); the canvas frame now has `allow="autoplay *"` so sound may start from the edit bar's press (refused sound falls back to silent play). Stop, the media's end or error, a redraw that removes the element, or choosing something else returns it to its own address and still.
  - **YouTube and Vimeo** refuse to play inside the canvas's sandbox (checked in real headless Chromium: YouTube black, Vimeo blank, while the same embeds play unsandboxed), so their own player (`youtube-nocookie.com/embed/…` or `player.vimeo.com/video/…`, autoplay, the service's bar, start time and Vimeo key kept) is laid over the link's place in the editor, clipped to the canvas and under the edit bar, following it as the canvas scrolls. Stop, removing it, choosing something else, or another element taking its place removes it. At the service's end its own replay screen stays until Stop.
  - Playback stays with the element it was started for: the element's start tag is checked again after every wait and while it plays (a stale bar, an address changed while the bytes load, or a sibling moving into its place stops it).
  - New lazy `src/page-builder/media-play.ts` (2.3 KB gzip chunk, loads on the first press) and DOM-free `src/page-builder/online-video.ts` (the starter's `onlineVideo`/`playerAddress`, typed; slice 67 can extend it). Wire: host `media-play`, frame `media-ended`.
- **Lead follow-up: the blob MP4 policy spec.** `native-media-policy.spec.ts` no longer records a clip live (frame timing under load) and no longer needs time to move 0.2 s past a late sample of a 1 s clip. It plays a committed two-second VP9-in-MP4 clip (`tests/native-save/clip.mp4`, 5.7 KB, generated once with Chromium's MediaRecorder; Playwright's Chromium has no H.264), looping, and counts seconds actually played. Red check: without `media-src` it fails (`NotSupportedError`); green with it. Stress: 6/6 at `--workers=4 --repeat-each=6` beside the video spec (30/30), and in the full suite.
- **Commits.** 65d191da claim; fbb567d3 build; a3aba7a6 protocol cases; c5ad3ccb review fix; this close.
- **Tests.** New `tests/media-play.test.ts` (address forms, start times, Vimeo keys, refused addresses; the player address; what an element plays: own `src`, first `<source>`, relative/encoded/entity paths, the site's own full address, refusals with reasons; the controller: typed bytes posted once, Stop at once while loading, a second press stops, choosing elsewhere stops, same element kept, the canvas's end for this play only, an unreadable file stops and reports, a stale bar or changed element never plays old bytes, another element in its place stops). `preview-wire` and `preview-protocol` cover the new messages. Nightly `native-media-video.spec.ts`: select a video, Play, it plays on the canvas (seconds played), Stop returns its own address and still with the page unchanged, choosing the heading stops it; an Online video's YouTube player (stubbed by route) lies over its place with the start time, Stop removes it, and removing it while playing removes its player. `npm run check`, `npm run lint`, unit 3,015/3,015 (8/8 after the fix). Full suite (`full-suite.sh 3`, preview runtime and wire touched) at a3aba7a6: 1,023 passed, 0 failed, 0 flaky. After the fix: the video and policy specs 15/15 (`--repeat-each=3`).
- **Review (GPT-6.1 Sol, read-only).** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-65/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` `REVIEW_STATUS: complete`). Fixed 2 (P2: an Online video's player could follow a sibling that took a removed link's place; P2 standards "proofs survive awaits": an address changed while the bytes loaded could play old bytes; both by the start-tag check, unit and browser cases added). Rejected 1 (P2: YouTube/Vimeo end and error events do not return to the still): with the service's own bar its end screen and errors stay usable and Stop returns the still; listening needs each service's player API (`enablejsapi`, Vimeo's player.js), beyond a playback check in the editor. Not re-reviewed: a small, unit-tested fix.
- **Bytes.** `test:budget` 349 KB gzip of 355 KB (same-base build 348 KB). Boot delta about +0.87 KB gzip: entry chunk +473 B (the button, the port, the `stop` icon, wiring), canvas runtime +396 B minified (playback in place, audio kept still).
- **Screenshots** (scratch): `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-65/` at 1280 (selected, playing, stopped, Online video selected and playing real YouTube) and 390 (selected, playing, ended). At 390 the canvas is about 145 px tall under the edit bar, so a tall selection's bar can sit out of view (existing phone layout, not this slice).
- **Follow-ups.** Slice 67: Online video records can reuse `onlineVideo`; placement adds the player stylesheet, which makes `.online-video` a block (without it an inline link's box, and so the overlay, is one text line high). Slice 89 (UX audit): Play/Stop on phone with the small canvas.
