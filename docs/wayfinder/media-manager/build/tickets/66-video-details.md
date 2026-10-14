---
title: Video details - still picture and subtitles
type: task (AFK)
status: open
assignee:
blocked_by: [59-every-kind-in-media, 62-player-markup]
builder: claude
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "The site's own videos" and "Audio".

- In a video's details: change the still picture to a chosen moment or any image from Media; it applies everywhere the video is used.
- Add a subtitles file (`.vtt` or `.srt`; `.srt` is converted to `.vtt` ★) to a video or audio file; it joins the family, gives the bar a CC button and audio a Transcript link.
- Agent-written subtitles appear in To check (slice 19).

## Done when

- Nightly in `native-media-video.spec.ts`: pick a still from a moment; add an `.srt`; the page's video has the new poster and a `<track>`.
