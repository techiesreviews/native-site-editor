---
title: The editor's security policy for media and video frames
type: task (AFK)
status: open
assignee: claude (mm-56 runner)
blocked_by: [01-bring-dev-level]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "Build checks"; research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §8.

- Add `media-src 'self' blob:` and YouTube/Vimeo frames (`https://www.youtube-nocookie.com`, `https://www.youtube.com`, `https://player.vimeo.com`) to `public/_headers:5`, and the same to the test server (`tests/native-save/server.ts:1116-1118`).
- Note in the Done section the remaining known difference (`worker-src 'self' blob:` on the test server only) and keep it unless a slice needs otherwise.
- Nothing else widens here; outside pictures are slice 71.

## Done when

- A unit test (for example `tests/editor-csp.test.ts`) reads both policies and checks `media-src` and the frame hosts are present and equal.
- A nightly spec plays a short MP4 from a blob in the canvas.
