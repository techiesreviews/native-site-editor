---
title: Starter player and agent-guide touch-ups
type: task (AFK)
status: open
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
