---
title: "One rule for repeated item kinds (grids and lists) in the editor and the runtime"
type: task (AFK)
status: open
assignee:
blocked_by: [20-runtime-bundle]
builder: sol
phase: 2
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/frame-protocol-design.md (sections 3, 4.1). Pure, no tree view needed. Does not need sturdy slice 10.

- `src/page-builder/rules/items.ts`: `ITEM_TAGS`, `NOT_GRIDS`, `itemKind(tag, className, section)`, `repeatedRun(kinds)` moved from card-grid.ts:22-58 (card-grid re-exports or its importers switch), and `CARD_ITEM_TAGS` = `ITEM_TAGS` minus `li`, `dd` with its reason (component-model `CARD_ITEMS` :1865 goes).
- Runtime "Repeated items" (:1337-1368): `ITEM_TAGS`, `NOT_GRIDS`, `itemKindOf` go; `repeatedItems` maps children through `itemKind(child.localName, child.getAttribute("class"), sectionLike(child))` and `repeatedRun`.
- component-model `itemOf` (:1634, Make component's first-class grouping) keeps its variant on top of `itemKind`, with the comment saying why it differs.

No disagreement found between the copies today; this slice only removes them.

## Done when

- `tests/card-grid.test.ts` cases for kinds move to `tests/rules-items.test.ts` (plus `CARD_ITEM_TAGS`); no other test changes.
- `rg "\"article\", \"li\", \"div\"|ITEM_TAGS = |CARD_ITEMS" src` finds only `rules/items.ts`.
- `native-cards`, `native-card-paths*`, `native-make-component*` specs green; `npm run check`, `npm test`, full `native-save` suite green.
