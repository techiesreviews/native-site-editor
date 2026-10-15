---
title: GIFs and YouTube or Vimeo players
type: task (AFK)
status: open
assignee: claude (mm-73 runner)
blocked_by: [70-improve-images-scan, 57-video-preparation, 67-online-video-records]
builder: sol
phase: 6
---

## What

Ticket [11](../../tickets/11-fix-all-existing-images.md#resolution-2026-10-13) "GIFs" and ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "YouTube and Vimeo".

- Each animated GIF on a page becomes a small silent Looping video (slices 57, 64). Where a GIF is a page's sharing picture, the sharing picture uses its first frame.
- Existing YouTube and Vimeo players can switch to "picture until tapped" (slice 67's markup and still), per page or all at once; other embeds stay alone.

## Done when

- `tests/improve-images.test.ts`: GIF to Looping video markup, GIF sharing picture to first frame, YouTube iframe forms switched, other iframes untouched.
