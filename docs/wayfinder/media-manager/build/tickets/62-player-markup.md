---
title: Video, audio and download markup
type: task (AFK)
status: open
assignee: claude (mm-62 runner)
blocked_by: [60-starter-player, 56-media-security-policy, 33-placed-image-markup]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13); the starter's player from slice 60.

- Writers for a placed video (`<video>` with `poster`, `preload="none"`, `controls` for the no-script fallback, subtitles `<track>`), audio (`<audio>`), and a download card (link with the first-page picture, name, type and size).
- Placing any of these adds the player script and style link to the page once, when missing, as the component loader is added today ★ (`src/page-builder/components.ts`, slice 103 of the components build).
- Same output for agents.

## Done when

- `tests/player-markup.test.ts`: each kind's markup, the player added once, a page that has it already, subtitles track.
