---
title: Video preparation; GIF becomes a looping video
type: task (AFK)
status: open
assignee: claude (mm-57 runner)
blocked_by: [23-one-preparation-path]
builder: sol
phase: 5
---

## What

Ticket [07](../../tickets/07-one-upload-path.md#resolution-2026-10-13) "Video" and the preset mappings; research [02](../../tickets/02-research-optimising-every-media-kind.md#resolution-2026-10-11) §4–5.

- Mediabunny (loaded on demand) to H.264 MP4: Smaller fits 1280 × 720 (or 720 × 1280), Balanced 1920 × 1080 (or 1080 × 1920), both medium quality; Higher quality at source size, high quality. AAC 128 kbps for an existing sound track; never invent one. Never enlarge.
- A WebP still picture from the video, in the family.
- Firefox on Android cannot encode: the file is added as it is if under the cap.
- **Animated GIF** becomes a silent looping H.264 MP4 in `media/videos/`, treated as video (ends slice 25's "kept as is").

## Done when

- `tests/video-prepare.test.ts`: preset sizes for landscape and portrait, never enlarged, sound kept or absent, GIF to MP4 path, unsupported-encoder fallback.
- Nightly in `native-media-adding.spec.ts`: add a short MP4 and an animated GIF; both arrive as MP4 with stills.
- Byte budget: boot delta zero.
