---
title: "Card fill and Change look read markup through the source tree"
type: task (AFK)
status: open
assignee:
blocked_by: [40-source-tree-module]
builder: sol
phase: 4
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md (sections 2.1 rows P14, P16, 2.3.1-2.3.2, 6).

- `card-fill.ts` except `itemPageFill` (299-328): `pageTitle`, `cardFill`, `matchSlot`, `fillElementEdits`, `newSlotElement`, `cardFillMarkup` read through `readSource` (whole document for title and meta; the card; fallbacks and fresh lines); `tree.attribute(…)?.value` and `plain(tree.text(…))` replace component-model's `startTagAttributes`/`plainText`; the local `squash`, `attribute`, `elementText`, `blankText` (29-34, 159-166) go.
- `card-swap.ts`: its 13 `parseSource` calls, `startTagAttributes` and local `squash`/`elementsOf`/`attribute`/`inner`/`blank` (46-52) go through `readSource`; `shows` reads a text-only fragment with `text()`.
- Behaviour, if the lead agrees (design section 9): T1 a page's title, description or matched text written with references reads as the browser shows it in Link to a page and in the fill; T2 Change look carries alt text and link addresses with references as written. Without a decision, keep today's decoding for that item.

## Done when

- `rg "parseSource|startTagAttributes|plainText" src/page-builder/card-swap.ts` finds nothing; in `card-fill.ts` only `itemPageFill` (slice 43) still uses them.
- `tests/card-fill.test.ts` gains a page titled `Caf&eacute; Rio` (title, list title, written fill); `tests/card-swap.test.ts` an `alt` and `href` with `&eacute;` carried unchanged; existing cases unchanged.
- `native-cards`, `native-add-card` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.
