---
title: Edit bars for Div, Button and Image blocks
type: task (AFK)
status: open
assignee:
blocked_by: [04-six-block-catalogue, 12-variant-parser-site-css]
builder: sol
phase: 4
---

## What

Ticket [10](../../tickets/10-block-set.md) §2 and §4, [12](../../tickets/12-prototype-drag-and-drop.md) §3.

- Div: a Layout select, Stack (`flow`, the default) or Grid (`cards`). This replaces the old Columns/Grid.
- Button: its link controls for the address; Variant and Size selects where the site's CSS defines `.btn[data-variant]` / `.btn[data-size]` (slice 12).
- Image placeholder: Choose image… and Alt text work on it as on any image (`src/controllers/page-structure-controller.ts:454-465`).
- Heading, Paragraph and Image offer no variants. Section's Tone comes in slice 61.

## Done when

- Nightly spec: Layout switches the class; a site with `.btn[data-variant]` shows Variant on a Button and writes it; Choose image… replaces the placeholder.
