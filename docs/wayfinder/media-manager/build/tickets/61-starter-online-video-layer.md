---
title: Starter - the YouTube and Vimeo layer
type: task (AFK)
status: open
assignee: claude (mm-61 runner)
blocked_by: [60-starter-player]
builder: claude
phase: 5
---

## What

Starter slice. Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "YouTube and Vimeo".

- An **Online video** shows its copied still with a play button; the service loads only on tap (`youtube-nocookie.com`, `player.vimeo.com`).
- After the tap the site-styled bar is laid over the service's player through its player API; YouTube's small logo may still show. When a Vimeo owner's plan does not allow hiding Vimeo's bar, Vimeo's own bar shows.
- Build checks to record: what YouTube still shows over the custom bar; whether YouTube or Vimeo captions can drive the CC button.

## Done when

- Scratch scenario on the starter root: a YouTube and a Vimeo video load only after the tap; the bar plays and pauses them.
- Committed on the starter's `dev`.
