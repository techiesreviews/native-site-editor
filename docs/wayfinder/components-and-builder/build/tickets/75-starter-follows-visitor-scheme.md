---
title: "Starter: pages follow the visitor's light or dark setting"
type: task (AFK)
status: open
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
