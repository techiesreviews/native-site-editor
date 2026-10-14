---
title: Online videos in the picker and Media
type: task (AFK)
status: open
assignee:
blocked_by: [67-online-video-records, 63-place-every-kind]
builder: claude
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13).

- A field in the Media picker to paste a YouTube or Vimeo address; Use places it.
- Online videos appear in Media under Video with a small YouTube or Vimeo mark, show their uses and can be placed again.

## Done when

- Nightly in `native-media-video.spec.ts` (service calls stubbed): paste a YouTube address, Use; the page shows the still and play button; Media lists it with the mark.
