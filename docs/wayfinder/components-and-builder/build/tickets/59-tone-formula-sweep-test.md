---
title: Tone formulas and the contrast sweep test
type: task (AFK)
status: open
assignee:
blocked_by: []
builder: sol
phase: 7
---

## What

Ticket [08](../../tickets/08-accessible-tone-text.md) §3, the proof.

- A pure module (for example `shared/tone.ts`) with the tone formulas the starter's CSS will use (slice 60): OKLCH to sRGB, WCAG contrast; the `brand` surface from `--brand` with its lightness nudged out of the middle band (at most 0.50 or at least 0.72, hue and chroma kept); the `accent` surface (a soft, high-lightness, low-chroma tint); text by `contrast-color()` (black or white) and by the computed fallback (near-white or near-black from the surface's lightness); buttons inverted (fill = text colour, label = surface).
- A unit test sweeps hue × lightness × chroma and asserts at least 4.5:1 for text and at least 3:1 for button fills against the band, for both text paths.
- The facts it rests on are in 08's last paragraph.

## Done when

- The sweep passes; it fails if the nudge band is narrowed (a check that the test can fail).
- The module's constants are named so slice 60 can copy them into CSS.
