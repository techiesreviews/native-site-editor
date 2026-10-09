---
title: "Tone: cap the band surface's chroma to sRGB"
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- Built as a luminance-keeping gamut map rather than a constant-hue cap: the nudged surface steps toward the grey of equal WCAG luminance until its linear sRGB channels fit, so contrast is kept and in-gamut surfaces are untouched. The exact constant-hue cap (cubic roots) worked but its CSS expanded to ~240 KB per use through custom-property substitution (~20 ms per band in Chromium); this recipe is ~1.4 KB. Hue can shift (≤ 5.4° for Display P3 surfaces; more for colours far outside P3). Vivid sRGB brands whose nudged surface leaves sRGB (2,490 of 84,311 grid brands, e.g. #ff0000, #0066cc) are mapped too; today the browser clips them.
- `shared/tone.ts` holds the CSS recipe (`--tone-raw`, `--tone-y`, `--tone-t`, `color(from … srgb-linear …)`), checked against the TypeScript in Chromium; slice 60 copies it.
- `tests/tone.test.ts`: sweep over all 280,174 grid points (every surface in sRGB, worst text 4.82:1 fallback, 4.96:1 `contrast-color`; narrowed band 0.55/0.67 fails 4,274 times), blue/cyan/magenta, wide cyan, hex brands, near-black/white in-gamut surfaces unchanged.
- Commits on `dev`: 8860560, 7b2088d.
