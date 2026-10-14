---
title: Agents place video, loop, stills, subtitles
type: task (AFK)
status: open
assignee:
blocked_by: [64-looping-video, 66-video-details, 68-online-videos-in-picker, 55-agents-tidy]
builder: sol
phase: 5
---

## What

Ticket [13](../../tickets/13-what-agents-may-do.md#resolution-2026-10-13) "Placing and framing", "Online videos" and "Subtitles".

- Agents may place video, audio and downloads, switch a Looping video on or off for a place, choose a video's still from a moment or an image in Media, write a subtitles file and attach it (by-agent mark, in To check), and place again an Online video already in Media. Pasting a new address stays with Lex.
- Media chapter: phase 5's rules; starter `AGENTS.md`, `fixtures/actual-starter` and the vendored `public/native-static-starter/v<sha>/` refreshed from the starter's `dev`, now with the player.

## Done when

- `tests/mcp-runtime.test.ts`: each tool; a new Online video address refused; subtitles carry the by-agent mark; the drift test passes.
- The preview's Start your site uses the vendored starter with the player.
