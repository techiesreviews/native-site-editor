---
title: A looping video's pause button inside a link stays on the page
type: task (AFK)
status: open
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
