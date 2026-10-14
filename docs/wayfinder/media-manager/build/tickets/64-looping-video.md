---
title: Looping video per place, and section backgrounds
type: task (AFK)
status: open
assignee:
blocked_by: [62-player-markup, 38-place-shape-and-focus]
builder: sol
phase: 5
---

## What

Ticket [12](../../tickets/12-video-audio-and-documents.md#resolution-2026-10-13) "Looping videos".

- Any video can be set, per place, to loop silently and play by itself (`muted loop playsinline autoplay` plus the player's corner button); a checkbox in the video's edit bar ★. Videos made from GIFs start with it on.
- Looping videos may fill picture spots (a card's photo, a component's hero), taking the spot's shape and focus point (slice 38).
- A section's background can be a Looping video; its still shows for reduced motion and save-data.

## Done when

- `tests/looping-video.test.ts`: the attributes, GIF videos on by default, picture-spot shape and focus, background markup.
- Nightly in `native-media-video.spec.ts`: switch looping on and off for a place; set a section background video.
