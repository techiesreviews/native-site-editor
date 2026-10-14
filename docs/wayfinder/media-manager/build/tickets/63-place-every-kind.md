---
title: Place every kind; Add panel Image becomes Media
type: task (AFK)
status: open
assignee: claude (mm-63 runner)
blocked_by: [59-every-kind-in-media, 62-player-markup, 18-media-picker]
builder: claude
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "In the editor".

- The Add panel's **Image** item becomes **Media**, opening the picker with every kind (the YouTube/Vimeo field comes in slice 68).
- Choosing a video, audio file or download places it with slice 62's markup. Ordinary videos with sound stay out of picture spots; a picture spot's picker offers only pictures and Looping videos (slice 64).
- On the canvas everything stays still so a click selects it.

## Done when

- `@smoke` `tests/native-save/native-media-video.spec.ts`: Add → Media → a video; the page has a `<video>` with its still and the player script; the canvas does not play it.
- Nightly: place an audio file and a PDF card.
