---
title: Media tab replaces Images, with the Tiles grid
type: task (AFK)
status: open
assignee: claude (mm-09 runner)
blocked_by: [04-split-library-screens, 06-image-families]
builder: claude
phase: 1
---

## What

Ticket [06](../../tickets/06-prototype-media-manager-look.md#resolution-2026-10-12); design reference [tiles.html](../../prototype/tiles.html) and [tiles-validation.md](../../prototype/tiles-validation.md).

- The **Images** tab becomes **Media** (label, icon, keyboard shortcut if any). Files stays for pages, styles and scripts.
- Media opens on **All**: a dense square Tiles grid, 3 across on phones, 4 on tablets, 6 on wide screens; thumbnails crop to fit (the stored file is untouched).
- **One tile per Image family** (slice 06). Files with no picture preview get a clean surface with dark text.
- Filenames on hover, keyboard focus or selection with a mouse; always visible on touch; soft gradient blur behind names, sharp text.
- The Media screen's code loads on demand when the tab first opens ★.
- Until slices 14 and 17 land, a tile opens today's details sheet and More reaches today's Optimise sheet, so nothing is lost.
- Wording says Publish, not Save (research 04).

## Done when

- `native-images-tab.spec.ts` is ported to the Media tab (renamed `native-media-tab.spec.ts`) and passes ★.
- Screens checked at 390, 768 and 1280 px against the mockup (scratch screenshots for the lead; the stage set comes later).
- Byte-budget delta at boot is zero or negative.
