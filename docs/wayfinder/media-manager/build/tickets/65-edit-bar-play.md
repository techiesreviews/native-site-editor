---
title: The edit bar's play button
type: task (AFK)
status: open
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
