---
title: "Starter: four tones from one brand colour"
type: task (AFK)
status: open
assignee:
blocked_by: [59-tone-formula-sweep-test]
builder: claude ★
phase: 7
---

## What

Repository: `~/Projects/native-site-editor-starter` (see the [spec](../spec.md) flow for starter slices and open point 1).

Ticket [08](../../tickets/08-accessible-tone-text.md) §1–4.

- `styles/tokens.css` holds one `--brand`. The tone rules live in one place in the shared CSS: `[data-tone="light"]` (default), `dark`, `brand`, `accent`.
- `light`/`dark` flip `color-scheme`. `brand`/`accent` set the surface from `--brand` with relative colour syntax, with slice 59's nudge and constants. Text uses `contrast-color()` under `@supports`, else the computed fallback. Buttons inside a toned band invert; links use the text colour, underlined. Browsers without relative colour syntax get fixed fallback colours.
- The hard-coded white goes: `styles/sections.css:30`, `:74`; `components/section-split/section-split.css:66`; `components/section-hero/section-hero.css:54`. The bands that used it take `data-tone`.
- The rules work on any element by hand (`[data-tone]`), though the editor offers them only on bands.

## Done when

- Every tone renders readably in light and dark mode, with the starter's brand and with a few others set in `tokens.css` (checked by slice 62).
- One commit in the starter repo; screenshots of each tone.
