---
title: Edit bars for Div, Button and Image blocks
type: task (AFK)
status: closed
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

## Done (2026-10-09)

- A `<div>` with a `flow` or `cards` class token shows a Layout select (Stack/Grid) that swaps the token in place (other classes kept), one undo step; other divs get none. An `<a>` with the `btn` token shows the site's `.btn[data-…]` axes (Variant, Size, …) through the instance variant path (same fields, Default removes, more than two behind Variants), its link controls unchanged; with no `.btn` variant rules (the real starter today) it shows none. The placeholder image takes Choose image… and Alt text like any image; no change was needed.
- Commits `a71ed69` (built by Sol), `429b2d5` (review: class tokens split on ASCII whitespace only; the no-rules spec waits for the reader).
- Tests: `tests/block-fields.test.ts` (5), nightly `tests/native-save/native-block-bars.spec.ts` (5) on `fixtures/native-variants/blocks.html` (with `.btn` variant rules and `images/`).
