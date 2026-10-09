---
title: Tone formulas and the contrast sweep test
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- `shared/tone.ts`: OKLCH→sRGB (clipped), WCAG contrast, brand surface nudged out of 0.50–0.72, accent tint (L 0.95, C ≤ 0.04), `contrast-color()` and computed-fallback text (L 0.99 / 0.01), inverted buttons; each formula carries the CSS slice 60 copies (ending `/ 1` so a transparent `--brand` can't hide text).
- `tests/tone.test.ts`: conversions, contrast, the nudge step, and the sweep over sRGB brand colours (73 hues × 101 L × 38 C grid, 84,311 in sRGB): worst text/button 5.24:1 (fallback), 5.39:1 (`contrast-color`), accent 17.5:1; a narrowed band (0.55/0.67) fails.
- Scope: brands outside sRGB (e.g. `oklch(0.5 0.37 184)`) are clipped by the browser and can drop to 3.7:1 with this band; hex/rgb/hsl brands are always covered.
- Commits: ddb083e and the docs/alpha follow-up on `dev`.
