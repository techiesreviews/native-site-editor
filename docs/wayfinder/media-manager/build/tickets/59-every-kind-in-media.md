---
title: Every kind in Media
type: task (AFK)
status: open
assignee:
blocked_by: [57-video-preparation, 58-audio-and-document-preparation, 12-usage-badges-and-list]
builder: claude
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "In the editor"; ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12).

- Video tiles show the still picture and length; audio tiles a sound picture and length; PDF tiles the first page; other downloads a file-type picture.
- The kinds in More (Video, Audio, Documents) now find them; details show the right preview (playable in details).
- Families include the video's still and subtitles.

## Done when

- Nightly in `native-media-screen.spec.ts`: a video, an audio file and a PDF show their tiles and lengths; kinds narrow to each.
