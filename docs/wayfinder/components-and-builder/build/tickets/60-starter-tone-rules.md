---
title: "Starter: four tones from one brand colour"
type: task (AFK)
status: closed
assignee:
blocked_by: [59-tone-formula-sweep-test, 69-tone-chroma-cap]
builder: claude ★
phase: 7
---

## What

Repository: `~/Projects/native-site-editor-starter` (on its `dev` branch, never `main`; see the [spec](../spec.md) flow for starter slices).

Ticket [08](../../tickets/08-accessible-tone-text.md) §1–4.

- `styles/tokens.css` holds one `--brand`. The tone rules live in one place in the shared CSS: `[data-tone="light"]` (default), `dark`, `brand`, `accent`.
- `light`/`dark` flip `color-scheme`. `brand`/`accent` set the surface from `--brand` with relative colour syntax, with slice 59's nudge and constants. Text uses `contrast-color()` under `@supports`, else the computed fallback. Buttons inside a toned band invert; links use the text colour, underlined. Browsers without relative colour syntax get fixed fallback colours.
- The hard-coded white goes: `styles/sections.css:30`, `:74`; `components/section-split/section-split.css:66`; `components/section-hero/section-hero.css:54`. The bands that used it take `data-tone`.
- The rules work on any element by hand (`[data-tone]`), though the editor offers them only on bands.

## Done when

- Every tone renders readably in light and dark mode, with the starter's brand and with a few others set in `tokens.css` (checked by slice 62).
- One commit on the starter's `dev` branch; screenshots of each tone.

**Amended (2026-10-09):** copy slice 69's chroma-capped surface recipe, so AA holds for wide-gamut brands too (Lex).

**Amended (2026-10-09, Lex):** slice 69 landed a luminance-preserving gamut map instead of a constant-hue chroma cap (the exact cap expands to ~240 KB of CSS per use). Copy the recipe from `shared/tone.ts`'s comments. Lex accepted the slight hue shift for very vivid brands.

## Done (2026-10-09)

- Starter `dev` commit `e3459d1`: `tokens.css` holds one `--brand` and the colour roles as `light-dark()` pairs (plain fallbacks kept); new `styles/tones.css` (layer `tones`, after `elements`) copies slice 59's nudge and text recipes and slice 69's luminance-preserving map for the brand surface, derives `--accent` from `--brand` (L ≤ 0.50 on light, ≥ 0.72 on dark, same map; sweep min 4.61:1 against page/surface), and sets the four `[data-tone]` rules: roles follow the band, so buttons invert and links take the text colour; a band directly in `<main>` bleeds to the window edges (`border-image`) with `--space-3xl` above and below. Fixed fallbacks without relative colour syntax (accent = ink) and a dark palette without `light-dark()`. The four hard-coded whites are `var(--on-accent)`; `.btn` and `.cta a` share one rule. AGENTS.md (outside the copied chapter) describes `tones.css` and `--brand`.
- Checked in Chromium 153 (no WebKit/Firefox here): every tone on plain sections, section-hero/split/contact, cards, `.btn`, `.cta`, `.steps`, header and footer, 8 brands (incl. #ffd400, #0066cc, #ff0000, `oklch(0.7 0.3 150)`) with the page light and dark: text ≥ 5.2:1, fills ≥ 3:1; the same with the relative-colour and `light-dark()` branches disabled; the editor's variant parser finds `data-tone` light/dark/brand/accent with no warnings; the six real pages pixel-identical. Screenshots in `.scratch/cb-build-shots/60/`. Sol review: two legacy-fallback defects (raw `--brand` accent, dark band without `light-dark()`), both fixed.
- For slice 62: computed accent/surface colours now serialise as `color(srgb-linear …)`, not `rgb(…)` (specs comparing `rgb(47, 109, 58)` need a tolerance after the fixture refresh). `worker/site-conventions.ts`'s Styles chapter lists the starter's files without `tones.css`.
