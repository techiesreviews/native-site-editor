---
title: Decide how video, audio and documents are handled
type: grilling (HITL)
status: open
assignee: Lex + claude (grilling)
blocked_by: [02-research-optimising-every-media-kind]
---

## Question

All media kinds are in scope (settled). Use the confirmed adding policy in [Decide the one way media gets added](07-one-upload-path.md#resolution-2026-10-13) for browser preparation, presets, previews, original retention, size limits, warnings and failure handling. Those choices are settled; this ticket decides playback and placement.

Can Lex place a video from YouTube or Vimeo by its address, and when should the editor suggest using an embedded video instead of storing one in the site? What markup do videos, audio and download links get (controls, autoplay muted for background video, `preload`, a download link with the file size)? How do these show in the compatible picker and on the canvas? How is the silent looping video made from an animated GIF placed? Preview generation is settled, but how are video still previews and PDF first-page previews used in those places?

## Comments
- 2026-10-13, how an ordinary video starts: Lex chose **still picture + play**. Visitors see the video's still preview with a play button; it plays with sound only when they tap, and the video itself loads only then. (Alternatives declined: playing silently on its own; choosing per video.)
- 2026-10-13, moving-picture videos: Lex answered with a pointer rather than an option: "Taking into account accessibility, we should be able to pick that it's looping, auto, muted and show basic pause and play buttons. If the user has motion turned off, it should be paused by default and only be playing when the button is pressed." So any video can be set, per place, to loop silently and play by itself, always with simple pause and play buttons; for visitors whose device asks for less motion, it starts paused and plays only when they press play. (The offered options were a per-place switch, recommended, or GIF videos only; Lex's answer extends the switch with the accessibility rules.)
