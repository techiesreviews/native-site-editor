---
title: "Tone: cap the band surface's chroma to sRGB"
type: task (AFK)
status: open
assignee:
blocked_by: [59-tone-formulas-and-sweep]
builder: sol
phase: 7
---

## What

Lex (2026-10-09), after slice 59: AA must hold for every brand colour, including very vivid wide-gamut brands written in `oklch()` (e.g. `oklch(0.5 0.37 184)`, which the browser clips to 3.7:1 today). Keep ticket 08's lightness band (0.50/0.72) as decided, and **cap the band surface's chroma so the surface stays inside sRGB** before the text colour is picked: very vivid brands render a touch less saturated on bands; hex/rgb/hsl brands are unchanged.

- In `shared/tone.ts`: add the cap (largest chroma at the nudged lightness and the brand's hue that is still in sRGB, or a safe closed-form bound), with its CSS recipe next to it (e.g. `oklch(from var(--brand) <L> min(c, <cap>) h / 1)` or a `clamp()`), as the other formulas have.
- Extend the sweep to every grid point (all 280,174, not only sRGB brands) and drop the sRGB-only scope note.
- Slice 60 copies the capped recipe into the starter.

## Done when

- The sweep passes for every brand on the grid, the lowest text contrast stays above 4.5:1, and narrowing the band still makes it fail.
- Unit tests for the cap at a few hues (blue, cyan, magenta) and for sRGB brands being unchanged.
