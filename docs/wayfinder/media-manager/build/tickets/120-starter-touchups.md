---
title: Starter player and agent-guide touch-ups
type: task (AFK)
status: closed
assignee: claude (mm-120 runner)
blocked_by: [115-placed-media-editor, 111-sub-screens-one-layout]
builder: claude
phase: 8
---

## What

Three small fixes in the starter (`native-site-editor-starter`, `dev`), found after slices 105, 111 and 115:

- **Subtitles above the control bar.** On the site's video player at 1280 wide, subtitles sit behind the player's control bar. Lift them above the bar while it shows and let them drop back when it hides, in every browser including WebKit (Safari).
- **A blocked Online video shows its still.** When a YouTube or Vimeo video can't load (blocked by the browser, an extension or offline), visitors see a blank white frame. Show the still picture with a short plain line and a link to watch it on YouTube or Vimeo instead.
- **AGENTS.md wording.** The starter's agent guide still says "presses OK", from before the sub-screens shared one layout (slice 111) and the editor's toast (slice 105). Match today's editor.

Then refresh `fixtures/actual-starter` and the vendored `public/native-static-starter/v<sha>/` in the editor so the drift test passes (as slices 96, 69, 75 and 81 did).

## Done when

- Subtitles clear the control bar at 1280 wide while it shows, drop back when it hides; checked in Chromium and WebKit.
- A blocked Online video shows the still, one plain line and a "Watch on YouTube/Vimeo" link; a working one plays as before.
- AGENTS.md no longer mentions "presses OK".
- The player stays CSS-first and small; script and CSS size delta reported.
- Starter checks, the editor's `@actual` and `@native-static` groups and the drift test pass.
- Before and after shots at 1280 and 390.
- Review by GPT-6.1 Sol (read-only `codex exec`) recorded.

## Done (2026-10-15)

- **Behaviour** (starter `dev`, `scripts/media-player.js`, `scripts/media-online.js`, `styles/media-player.css`, `AGENTS.md`).
  - **Subtitles above the bar.** `liftSubtitles` keeps the browser's own cue rendering (so visitors' caption preferences still apply) and moves each cue with `VTTCue.line`, in the browser's snap-to-lines steps (5% of the picture's smaller side): while the bar shows, a cue goes up by the bar's height plus its own rows (line breaks plus a wrap guess that errs high, because a cue's first line sits on its line number and Chromium has no `lineAlign`); when the bar hides (idle), it goes back to the bottom. Cues the subtitles file places itself keep their line. Chromium redraws a cue already on screen only when it is added again, so a moved on-screen cue is removed and re-added in the same task (no flicker). It follows the bar's `hidden`, `data-idle`, `data-started`, `data-narrow`, the player's size (full screen too), the track's load, and an iPhone's own full screen (back to the bottom there).
  - **Blocked Online video.** When the service cannot be reached, the still stays and a centred note on the site's surface reads "This video can't play here. **Watch on YouTube**" (or Vimeo), linking to the video's own address; focus moves to the link if it was on the play button. "Cannot be reached" = offline at the tap (`navigator.onLine`), the player API fails to load, or the player never answers within 10 s (one shared `within10s` limit). Before, all of these handed over to the service's frame, which shows a white or error page when blocked. Videos keeping the service's bar (`data-controls="service"`) load the API too, as a probe: their player's own ready answer (YouTube `onReady`, Vimeo `ready()`) must come within 10 s; YouTube's embed now always carries `enablejsapi=1` and `origin` (only the site's bar adds `controls=0`, `disablekb`). Errors the service shows itself (embedding disabled, a phone refusing the start) still hand over as before. Late answers after the fallback change nothing.
  - **AGENTS.md / conventions.** "presses OK" → "presses Looks right" in the Media chapter (`worker/site-conventions.ts`, the starter's `AGENTS.md`, drift test) and in `CONTEXT.md`; the starter's Online video line says what visitors see when the service cannot be reached.
- **Commits.** Starter `dev`: 2bff35d (fix), c5de395 (review: service-bar Vimeo), efc3188 (review: service-bar YouTube), pushed `HEAD:dev` under the lock. Editor: 6a52e3dd claim (ticket created, README Phase 8 row); aad7745a, e6eb3e40, 2067eac2 refreshes (`fixtures/actual-starter` re-archived; vendored `vc597698` → `vefc3188`, regenerated with a script verified by reproducing `vc597698` byte for byte; only `AGENTS.md` and the three player files differ; `NATIVE_STARTER_VERSION`, `docs/native-starter-source.md`, fixture README); this close.
- **Tests.** Playwright scratch scenario (`/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-120/scenario.mjs`: own static server with byte ranges serving the starter root, a demo page, a canvas-recorded WebM and a VTT with a wrapping two-line cue and a file-placed top cue; YouTube and Vimeo stubbed, blocked or held by route) in Chromium 153, Firefox 155 and WebKit 26.6 at 1280 and 390: 93/93. Subtitle checks are pixel-based (bar hidden from paint, subtitle backing counted where it sits): paused with the bar, idle (back at the bottom), wake, CC off and on, file-placed cue kept. Online: blocked Vimeo (site's bar and own bar), offline YouTube at once, working YouTube still plays, and 11 race rows per browser (API held then loads/fails, ready only after 10 s, for the site's bar and both services' own bars; working own-bar YouTube and Vimeo stay with the service): one fallback, the right address, no frame, no bar. The unchanged starter fails 36 of the first 54 (all the new checks). WebKit needed seven unpacked system libraries (LD_PRELOAD, no install), as in slices 60/61/96. Editor (rebased on 8de4a8c0): `npm run check`, `npm run lint`, unit 3,468/3,468 (drift test included), `@native-static` 2/2, `@actual` 58/58.
- **Review (GPT-6.1 Sol, read-only), 2 rounds.** Evidence: `/home/ubulex/Projects/native-site-editor/.scratch/reviews/mm-120/round-1/` and `round-2/` (run.log: model gpt-6.1-sol, sandbox read-only; result.md `REVIEW_STATUS: complete`). Round 1: P2 a blocked `data-controls="service"` video still showed the frame → fixed (c5de395); race-coverage gap → rows added. Round 2: P2 the same for service-bar YouTube (API loads, embed blocked) → fixed (efc3188); gaps (service-bar YouTube and Vimeo race rows, working service-bar YouTube) → added. Rejected 0. Round-2 fixes not re-reviewed (brief: one re-review); covered by the 93-check scenario.
- **Bytes.** Editor boot unchanged (no editor code; `test:budget` 349 KB of 355 KB). Starter, gzip: `media-player.js` 8.24 → 9.02 KB (+776 B), `media-online.js` 5.99 → 6.51 KB (+514 B), `media-player.css` 3.38 → 3.61 KB (+231 B); much of it comments.
- **Shots.** `/home/ubulex/Projects/native-site-editor/.scratch/shots/mm-120/before/` and `after/`: subtitles with the bar and idle, blocked Online video, offline (390), per browser at 1280 and 390.
- **Follow-ups.** A Vimeo video's own captions draw inside its frame, so the site's bar can still cover them (the site cannot move them). A visitor's very small caption-size setting in Safari could make the lift a little short (the step assumes the default 5%). Real phones (iPhone full screen captions) remain for a device.
