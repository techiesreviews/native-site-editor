---
title: "Card copies on the source tree: card-grid's elementTree, plainText and slot scan go"
type: task (AFK)
status: open
assignee:
blocked_by: [41-card-tree-fill-and-swap, 42-card-tree-page-paths, 45-element-end-at-parent]
builder: sol
phase: 4
---

## What

Design: /home/ubulex/Projects/native-site-editor/.scratch/sturdy/card-tree-design.md (sections 2.1 rows P5, P11-P13, P15, 2.3.5, 6, 10.1).

- `card-grid.ts`: `elementTree` and its `SourceElement`, `RAW_TEXT`, `plainText`, `decodeEntities`, `allElements`, `attribute` (61-146, 175-186) go; `textLeaves`, `titleLeaf`, `itemTitle`, `itemCopy`, `itemFill`, `pageBodyCopy`, `leafSummary` read a `readSource` tree and require `exact` where `elementTree` was required (not only the outer `range`). `slotFallbacks` (476-487) reads `templateSlots`. `aOr`, `itemNoun`, `insertAfterEdit`, `ownLines` keep their exports (26 imports `aOr`).
- `withTitle` (259, used at 297 and 438) matches the decoded old title inside each decoded text run and replaces that run's source span (offsets through `textRangeInSource`).
- `card-fill.ts` `itemPageFill` (299-328): one `readSource` of the card instead of `elementTree` + `parseSource`; the `itemPlainText` import goes. `cards.ts`: `cardMarkup`, `subpageDocument`, `canFill` (310) and `tagOf` (343) on the tree; `itemElement` (card-source 161-165) goes.
- Behaviour, if the lead agrees: T5 Add card's copy writes a slot fallback's text as the browser shows it and takes a fallback holding a nested slot whole. Without a decision, keep today's fallback text.

## Done when

- `rg "elementTree|function plainText|function decodeEntities|indexOf\(\"</slot\"" src/page-builder` finds nothing outside source-tree.ts and component-model.ts.
- `tests/card-grid.test.ts`'s `elementTree`/`plainText` uses go through `readSource` (replace, don't layer), plus: a fallback `Caf&eacute;`, a nested slot's fallback, `withTitle` with a title written with references, with formatting in the title leaf, and with another spelling of the same character in kept text; `<div><span>A</div>` still refused.
- `native-cards`, `native-add-card*`, `native-card-paths*`, `native-slot-change-pages-actual` specs green; `npm run check`, `npm test`, full `native-save` suite green; budget delta reported.
