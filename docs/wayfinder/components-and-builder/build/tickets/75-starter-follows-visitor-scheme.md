---
title: "Starter: pages follow the visitor's light or dark setting"
type: task (AFK)
status: closed
assignee:
blocked_by: [60-starter-tone-rules]
builder: sol
phase: 7
---

## What

Lex (2026-10-09), after slice 60: the starter follows the visitor's system setting. In `~/Projects/native-site-editor-starter` on `dev`, set `color-scheme: light dark` for the page (slice 60 left it `light`), so pages and bands without a tone follow the visitor; `data-tone="light"` and `"dark"` bands keep their own scheme; brand and accent bands keep working in both. Also list `tones.css` in the Styles chapter of the editor's conventions (`worker/site-conventions.ts`, outside the drift-checked Components chapter) and update the starter's `AGENTS.md` Styles/Layout notes.

## Done when

- Chromium check with `prefers-color-scheme` light and dark: every tone on plain sections, components, cards, buttons, header and footer stays AA (as slice 60's check), with 4+ brand colours; images and the placeholder read on both; light mode is pixel-identical to before.
- Screenshots of the home page and the tone test page in both modes.

## Done (2026-10-09)

- Starter `dev` commit `bbc0742`: `tones.css` sets `:root { color-scheme: light dark }` under `@supports (color: light-dark(…))`, so the page and untoned bands follow the visitor; browsers without `light-dark()` stay `light` (no dark controls on the light palette). `light`/`dark` bands keep their scheme; `brand`/`accent` unchanged. AGENTS.md's Styles paragraph updated (Components chapter untouched). Editor: the conventions' Styles chapter lists `tones.css`.
- Checked in Chromium with `prefers-color-scheme` light and dark: every tone (none, light, dark, brand, accent) on plain sections, section components, cards, `.btn`, `.cta`, `.steps`, forms, header and footer, 6 brands (starter, #ffd400, #0066cc, #ff0000, `oklch(0.7 0.3 150)`, #808080): text and fills ≥ 4.93:1 in both modes, ≥ 5.57:1 with `light-dark()` disabled; the six real pages byte-identical in light mode; illustration and image placeholder read on dark. Screenshots in `.scratch/cb-build-shots/75/`.
- Note: the drift-checked Components chapter still calls `light` "the default: no attribute"; in the starter, no attribute now means the visitor's setting.
