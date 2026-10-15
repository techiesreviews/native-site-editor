---
title: Online video stills join their video
type: task (AFK)
status: open
assignee: claude (mm-100 runner)
blocked_by: [68-online-videos-in-picker]
builder: sol
phase: 5
---

## What

Follow-up left open by slices [59](59-every-kind-in-media.md), [67](67-online-video-records.md) and [68](68-online-videos-in-picker.md).

When an Online video (YouTube or Vimeo) is placed, its still picture is copied into the site. That copy currently shows in Media as a separate picture tile, and Clean up may count it as unused. It should belong to the online video's family, the same way a local video's still does (slices [59](59-every-kind-in-media.md) and [66](66-video-details.md)):

- Not its own tile in Media; it shows with the online video.
- Never counted unused while the online video's record or uses exist.
- Removed and restored together with the online video.

Reuse the existing media family mechanism; no parallel one.

## Done when

- Unit tests cover the family rule (online still belongs to its online video) and Clean up (the still is not unused while the video's record or uses exist).
- The nightly online-video case in `native-media-video.spec.ts` also checks that Media shows no separate still tile.
