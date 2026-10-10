---
title: "Card grids, slot links and sibling pages read page paths through the source tree"
type: task (AFK)
status: open
assignee:
blocked_by: [40-source-tree-module, 33-block-move-mcp-and-dead-card-moves]
builder: sol
phase: 4
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md (sections 2.1 rows P1-P10, 2.3.3-2.3.4, 2.3.6, 4, 6).

- `card-source.ts`: `gridAt`, `gridOfItem`, `itemAround`, `pageGrids`, `instanceLabel`, `mainRange` take a `SourceTree<N>` (generic, as `rules/` take a `RuleView<N>`); `itemRoute`, `gridLabel` use `elements`, `children`, `attribute`, `text` and `view.parent` instead of DOM calls; `childAt`, `Parsed` and the five `parseMarked` calls go. `gridOfItem(source, node, context)` keeps a string overload (it calls `readPage`) so `main.ts:1736` is not edited.
- `card-slot.ts`: `cardSlotAddEdit` finds the instance and its children's `slot` through `readPage(source)` (the `nativeOutline` walk, 55-57, goes; `nativeInstanceInsertEdit` still writes); `slotCardLinks` takes a tree (the `<body>` walk and double decode, 78-86, go).
- `cards.ts`: one `readPage(source)` per plan or paint; `locateNativeElementRange` (339, 352, 372, 563), `itemElement(parentRange).children` (439-440) and the raw `slot`/`href` decodes (286-287, 443, 453-454) become `at`, `range`, `children`, `attribute`. Files shared with 33 (`cards.ts`): run after it, so `move` (486-506) is already gone.
- Behaviour, if the lead agrees: T3 "In this grid" and Create page's sibling pages are the card's own when a `<script>` sits among the instance's children; T4 an implied end tag inside an instance no longer loses sibling titles or mixes two slots of one card component; T6 a card's link address is decoded once. Without a decision, keep today's reading for that item.

## Done when

- `rg "parseMarked|markedRange|nativeOutline|locateNativeElementRange|querySelector|textContent" src/page-builder/card-source.ts src/page-builder/card-slot.ts src/page-builder/cards.ts` finds nothing.
- `tests/card-source.test.ts` covers grids, items, `itemAround`, labels, collections and `mainRange` in Node on `readSource(page, { page: true })`; `tests/card-slot.test.ts` a `<script>` among an instance's cards and a page with no `<body>` tag; `tests/cards-controller.test.ts` one Create page case with a `<script>` among the cards.
- `native-cards`, `native-add-card*`, `native-card-paths*`, `native-delete-card-race`, `native-slot-change-pages-actual` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.
