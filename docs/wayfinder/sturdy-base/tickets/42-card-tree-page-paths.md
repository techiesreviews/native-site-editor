---
title: "Card grids, slot links and sibling pages read page paths through the source tree"
type: task (AFK)
status: closed
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

## Done (2026-10-11)

- card-source's `gridAt`, `gridOfItem` (string overload kept for main.ts), `itemAround`, `pageGrids`, `instanceLabel`, `mainRange` take a `SourceTree<N>`; `childAt`, `Parsed`, the parse-per-call and DOM walking go. card-slot's `cardSlotAddEdit` and `slotCardLinks` take a tree (the `nativeOutline` walk, `<body>` walk and double decode go; `nativeInstanceInsertEdit` still writes). cards.ts reads `readPage(source)` for card ranges, the last item's slot and sibling pages (`itemTitle` of a peer stays on `itemElement` until 43). T3, T4 (sibling pages and slots; a peer's own title still needs an exact peer) and T6 built. Commits 387ccac7, 27aad70f (Sol built, Claude fixed a missing-parent guard; Sol's review found no defects).
- Tests: card-source +10 (grids, items, itemAround, labels, collections, mainRange, scripts on `readSource(page, { page: true })`), card-slot +6 (script among an instance's cards for links and Add card, `&amp;eacute;` href once, no `<body>`, strict refusal, missing parent), cards-controller +3 Create page cases (script, implied end on the grid path and the links path). `npm test` 1926; full native-save 887 passed, 0 failed; smoke 42, @actual 54. Budget +177 B gzip total, paint 338 KB unchanged.
