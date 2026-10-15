---
title: A looping video's pause button inside a link stays on the page
type: task (AFK)
status: closed
assignee: claude (mm-96 runner)
blocked_by: [73-improve-gifs-and-players]
builder: claude
phase: 6
---

## What

Follow-up from slice 73's review. Improve images turns a GIF inside a link into a Looping video that stays inside that link (`<a href><video src poster muted loop playsinline></video></a>`, no `controls`). The starter's player (slice 60, `scripts/media-player.js`) gives it a small round pause/play button in a corner. Pressing that button also followed the link, so a visitor who only wanted to stop the motion left the page.

- In the starter's `scripts/media-player.js`: the corner button's press (click, Enter, Space) pauses or plays and does nothing else; a middle click on it opens no tab. It cancels the link's navigation and stops the press from reaching the link's or a card's own click handlers, on the button only. Pressing the rest of the picture, or the link's text, still follows the link.
- Keyboard and screen readers stay right: the button keeps focus and its "Pause video"/"Play video" name; the link's own name does not take the button's changing words, also for an unnamed video (a GIF with `alt=""`).
- Reduced motion still holds: the video starts paused and the corner plays it, without following the link.
- The markup comment at the top of the player and the starter's `AGENTS.md` say how to write a looping video inside a link.
- The editor's `fixtures/actual-starter` and vendored `public/native-static-starter/v<sha>/` move to the new starter commit.

## Done when

- A Playwright scratch scenario serving the starter root (as in slice 60) passes in desktop Chromium, Firefox and WebKit: corner click, Enter and Space toggle without navigating, a middle click opens no tab and leaves playback alone; clicks on the picture and the link text, and Enter on the link, still follow it; Tab order and the accessibility tree; reduced motion; a looping video outside a link and one in a stretched-link card still work.
- Committed on the starter's `dev` and pushed; the editor's starter fixture and vendored copy refreshed, drift test passing.

## Done (2026-10-15)

- **Behaviour** (starter `scripts/media-player.js`, `enhanceLooping`). The corner button's click cancels the press for the link (`preventDefault`) and stops it there (`stopPropagation`), so the link, a clickable card or a site script never sees it; `auxclick` (middle click) is cancelled the same way, so it opens no tab and leaves playback alone (buttons do not act on a middle click). Enter and Space reach the button as a click, so they toggle in place and focus stays on the button. Clicking the picture, the link's text, or Enter on the link still follows it. Inside a link the wrapper is a group named after the video (`aria-label`, else "Looping video" for an unnamed one), so the link reads "Dancing square Read the story" rather than "… Pause video …", and its name no longer changes with the button. Outside links nothing else changes (no group added). Reduced motion unchanged: paused at first, the corner plays it without following the link. A looping video in a `.cards` item with a stretched title link already kept its corner on top (`z-index: 1`); checked, no change. The markup comment and the starter's `AGENTS.md` ("Video, audio and downloads", not the compared Media chapter) say to write a looping video inside a link without `controls`.
- **Commits.** Starter `dev`: d4c2635 (fix, docs), 3aa1b13 (review fix: unnamed videos). Editor: 360e3d31 claim; 5124b8fa refresh to d4c2635; 8b988a1c refresh to 3aa1b13 (`fixtures/actual-starter` byte-identical, vendored `v7a35988` → `v3aa1b13`: only `AGENTS.md` and `scripts/media-player.js` differ, manifest sizes/sha256, `NATIVE_STARTER_VERSION`, `docs/native-starter-source.md`, fixture README); this close.
- **Tests.** Playwright scratch scenario (main checkout `.scratch/reviews/mm-96/scenario.mjs`: own static server with byte ranges serving the starter root plus a demo page and a WebM recorded from a canvas, as no ffmpeg is installed) on desktop Chromium, Firefox and WebKit: 93/93 checks, twice: corner click, Enter and Space toggle with no navigation and no page scroll, focus stays, label follows; the link's own click listener does not fire; middle click opens no tab and leaves playback alone; a `controls muted loop` video in a link; picture click, link text click and Enter on the link follow it; Shift+Tab from the corner reaches the link (in Firefox via the video, which Firefox makes a tab stop even without the player); accessibility tree: button inside the link, link named by video and text, unchanged across toggles, also for unnamed videos ("Looping video Read the story", "Looping video"); no group outside links; stretched-link card; reduced motion. The unchanged starter fails 42 of the same checks (every press followed the link). WebKit needed six unpacked system libraries (LD_PRELOAD, no install), as in slices 60/61. Editor: `npm run check`, `npm run lint`, unit 3,213/3,213 (drift test included); `@native-static` 2/2; `@actual` 57/58: `native-plain-section-drops-actual:67` fails on dev already (it clicks the Blocks rail's "Image", which slice 63 renamed "Media"), unrelated to the starter.
- **Review (GPT-6.1 Sol, read-only), 1 round.** Evidence: main checkout `.scratch/reviews/mm-96/` (`run.log`: model gpt-6.1-sol, sandbox read-only; `result.md` `REVIEW_STATUS: complete`). Fixed 1 (P2: an unnamed linked video still let "Pause video" into the link's name; now "Looping video", with scenario checks). Rejected 1 (P2: middle click should toggle playback): buttons never activate on a middle click in any browser; the requirement was that it opens no tab, so the ticket's wording was corrected and a check added that it leaves playback alone. Not re-reviewed: a one-condition change with checks that fail without it.
- **Bytes.** Editor boot delta 0 (no editor code changed; `test:budget` 350 KB of 355 KB). Starter `media-player.js` 7.89 → 8.23 KB gzip (mostly comments).
- **Follow-ups.** Dev: `native-plain-section-drops-actual:67` needs "Media" instead of "Image" (slice 63's rename). Real phones (VoiceOver, TalkBack inside a link) remain for a device.
